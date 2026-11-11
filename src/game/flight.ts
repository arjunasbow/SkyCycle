import type { BikeDataAdapter, BikeState } from '../bike/types';
export interface Calibration { referenceWatts: number; referenceCadence: number; gain: number; }
export const DEFAULT_CALIBRATION: Calibration = { referenceWatts: 45, referenceCadence: 80, gain: 1 };
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export class FlightInputAdapter {
  private state: BikeState;
  private unsubscribe: () => void;
  constructor(adapter: BikeDataAdapter) { this.state = adapter.getState(); this.unsubscribe = adapter.subscribe(state => { this.state = state; }); }
  effort(now: number, calibration: Calibration): number {
    const { sample: s, status } = this.state;
    if (status !== 'connected' && status !== 'simulated') return 0;
    const fresh = (at: number) => now >= at && now - at < 3000;
    const cadenceFresh = fresh(s.cadenceAt ?? s.timestamp), powerFresh = fresh(s.wattsAt ?? s.timestamp);
    // A previously reported cadence is a safety gate, even when power keeps arriving.
    if (s.cadence !== undefined && (!cadenceFresh || !Number.isFinite(s.cadence) || s.cadence < 3)) return 0;
    const power = s.watts !== undefined && Number.isFinite(s.watts) && powerFresh ? s.watts : undefined;
    const cadence = s.cadence !== undefined && Number.isFinite(s.cadence) && cadenceFresh ? s.cadence : undefined;
    const normalized = power !== undefined ? Math.max(0, power) / Math.max(20, calibration.referenceWatts) : cadence !== undefined ? cadence / Math.max(20, calibration.referenceCadence) : 0;
    return clamp(normalized * clamp(calibration.gain, .25, 2), 0, 1.5);
  }
  dispose() { this.unsubscribe(); }
}
export interface FlightControls { steer: number; pitch: number; }
export interface FlightState { x: number; y: number; z: number; heading: number; bank: number; pitch: number; speed: number; verticalSpeed: number; thrust: number; elapsed: number; }
export function initialFlight(): FlightState { return { x: 0, y: 45, z: 110, heading: 0, bank: 0, pitch: 0, speed: 15, verticalSpeed: 0, thrust: 0, elapsed: 0 }; }
/** Fixed-step-friendly arcade physics. Units: metres, seconds, m/s, radians. */
export function stepFlight(s: FlightState, controls: FlightControls, effort: number, dt: number, floor = 4) {
  dt = clamp(dt, 0, 1 / 30);
  const smooth = (current: number, target: number, response: number) => current + (target - current) * (1 - Math.exp(-response * dt));
  // Effort reaches lift promptly, even while forward momentum is retained.
  s.thrust = smooth(s.thrust, clamp(effort, 0, 1.5), effort < s.thrust ? 10 : 6);
  s.bank = smooth(s.bank, clamp(controls.steer, -1, 1) * .55, 4);
  s.pitch = smooth(s.pitch, clamp(controls.pitch, -1, 1) * .35, 3);
  s.heading = clamp(s.heading + s.bank * .8 * dt, -1.2, 1.2);
  const gravity = 9.81;
  // At reference effort lift balances gravity. A modest effort change gives ~1 m/s
  // climb/descent, without waiting for airspeed to bleed away or requiring coasting.
  const lift = gravity * clamp(1 + (s.thrust - 1) * 2.4, 0, 2.2) * clamp(s.speed / 10, 0, 1);
  s.verticalSpeed = clamp(s.verticalSpeed + (lift - gravity + s.pitch * s.speed * .65 - s.verticalSpeed * 2.8) * dt, -4, 5);
  s.speed = clamp(s.speed + (s.thrust * 6 - .014 * s.speed * s.speed - gravity * Math.sin(s.pitch) * .25) * dt, 0, 30);
  s.x = clamp(s.x + Math.sin(s.heading) * s.speed * dt, -470, 470);
  s.z -= Math.cos(s.heading) * s.speed * dt;
  s.y = clamp(s.y + s.verticalSpeed * dt, floor, 200);
  if (s.y <= floor || s.y >= 200) s.verticalSpeed = 0;
  s.elapsed += dt;
}
export interface Target { x: number; y: number; z: number; radius: number; hit: boolean; kind: 'ring' | 'balloon'; bonus?: boolean; balloonRadii?: [number, number, number]; balloonOffsetY?: number; }
export interface TargetHit { target: Target; index: number; points: number; }
export const DEFAULT_RIDE_SECONDS = 300;
export const BIKE_HIT_RADIUS = 1.8;
export const BIKE_HIT_HEIGHT = 3.2;
export const BALLOON_RADII: [number, number, number] = [7, 9, 7];
export const BALLOON_OFFSET_Y = 3;
export const COURSE_END_Z = -2450;
export function createCourse(): Target[] {
  return Array.from({ length: 20 }, (_, i) => ({ x: Math.sin(i * .55) * 38, y: 45 + Math.sin(i * .55) * 10, z: -50 - i * 120, radius: 6, hit: false, kind: i % 5 === 4 ? 'balloon' : 'ring' }));
}
/** Advisory effort only: never applies thrust or vertical steering to the rider. */
export function courseEffortHint(s: Pick<FlightState, 'y' | 'z' | 'speed' | 'heading'>, target?: Target): number {
  if (!target) return 1;
  const seconds = Math.max(2, (s.z - target.z) / Math.max(5, Math.cos(s.heading) * s.speed));
  const desiredVerticalSpeed = clamp((target.y - (s.y + BIKE_HIT_HEIGHT)) / seconds, -1.4, 1.4);
  return 1 + desiredVerticalSpeed * 2.8 / (9.81 * 2.4);
}
/** Lateral-only assistance: leaves power, pitch, altitude and scoring to the rider. */
export function assistedSteering(s: Pick<FlightState, 'x' | 'z' | 'heading' | 'bank'>, targets: Target[]): number {
  const next = targets.find(t => !t.bonus && !t.hit && t.z < s.z);
  const dx = (next?.x ?? 0) - s.x;
  const ahead = next ? Math.max(18, s.z - next.z) : 120;
  const desiredHeading = clamp(Math.atan2(dx, ahead), -.9, .9);
  return clamp((desiredHeading - s.heading) * 4 - s.bank * .9, -1, 1);
}
type CollisionPose = Pick<FlightState, 'x' | 'y' | 'z'> & Partial<Pick<FlightState, 'heading' | 'pitch'>>;
function bikeHitCenter(s: CollisionPose) {
  return { x: s.x + Math.sin(s.heading ?? 0) * 1.8, y: s.y + BIKE_HIT_HEIGHT + Math.sin(s.pitch ?? 0) * 1.8, z: s.z - Math.cos(s.heading ?? 0) * 1.8 };
}
/** Sweep the visible bicycle through the ring plane or expanded balloon ellipsoid. */
export function collectTargets(previous: CollisionPose, current: CollisionPose, targets: Target[], onHit?: (hit: TargetHit) => void): number {
  let score = 0;
  const a = bikeHitCenter(previous), b = bikeHitCenter(current);
  for (let index = 0; index < targets.length; index++) {
    const t = targets[index]; if (t.hit) continue;
    let hit = false;
    if (t.kind === 'ring') {
      if (a.z < t.z || b.z > t.z || a.z === b.z) continue;
      const ratio = (a.z - t.z) / (a.z - b.z);
      const x = a.x + (b.x - a.x) * ratio, y = a.y + (b.y - a.y) * ratio;
      hit = Math.hypot(x - t.x, y - t.y) <= t.radius + BIKE_HIT_RADIUS;
    } else {
      const radii = (t.balloonRadii ?? BALLOON_RADII).map(r => r + BIKE_HIT_RADIUS);
      const centerY = t.y + (t.balloonOffsetY ?? BALLOON_OFFSET_Y);
      const p = [(a.x - t.x) / radii[0], (a.y - centerY) / radii[1], (a.z - t.z) / radii[2]];
      const d = [(b.x - a.x) / radii[0], (b.y - a.y) / radii[1], (b.z - a.z) / radii[2]];
      const length2 = d.reduce((sum, value) => sum + value * value, 0);
      const ratio = length2 ? clamp(-p.reduce((sum, value, i) => sum + value * d[i], 0) / length2, 0, 1) : 0;
      hit = p.reduce((sum, value, i) => sum + (value + d[i] * ratio) ** 2, 0) <= 1;
    }
    if (hit) { t.hit = true; const points = t.kind === 'ring' ? 100 : 250; score += points; onHit?.({ target: t, index, points }); }
  }
  return score;
}
/** The finite scenery repeats in both modes; only the timer ends an arcade ride. */
export function wrapCourse(s: FlightState, targets: Target[]): boolean {
  if (s.z >= COURSE_END_Z) return false;
  s.z = 110; s.x = 0; s.heading = 0; s.bank = 0;
  targets.forEach(t => { t.hit = false; }); return true;
}
export function timedRideFinished(mode: 'scenic' | 'arcade', elapsed: number): boolean { return mode === 'arcade' && elapsed >= DEFAULT_RIDE_SECONDS; }
