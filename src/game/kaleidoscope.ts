import { BIKE_HIT_HEIGHT, clamp, courseEffortHint, stepFlight, type FlightState } from './flight';

// Distances are continuous; recycling visuals never changes the rider's coordinates.
export const CHAPTER_LENGTH = 720;
export const JOURNEY_LENGTH = CHAPTER_LENGTH * 4;
export const CHAPTERS = ['Neon Passage', 'Funhouse', 'Liquid Glass', 'Luminous Garden'] as const;
export const FLOW = { interval: 5, points: 100, doubleAt: 15, tripleAt: 30, resetAfter: 3, drain: 2, tolerance: .8, lotusBonus: 500 };
export const distanceAt = (z: number) => 110 - z;
export function chapterAt(distance: number) { return Math.floor(Math.max(0, distance) / CHAPTER_LENGTH) % 4; }
export function chamberAt(distance: number) {
  const phase = ((distance % JOURNEY_LENGTH) + JOURNEY_LENGTH) % JOURNEY_LENGTH;
  // Cosine envelope: broad and level around the two monumental encounters.
  const separation = Math.min(Math.abs(phase - 1380), Math.abs(phase - 2760));
  return separation < 210 ? (1 + Math.cos(separation / 210 * Math.PI)) / 2 : 0;
}
export function routeX(distance: number) { return Math.sin(distance / 340) * 42 + Math.sin(distance / 810) * 22; }
export function routeY(distance: number) {
  // Flat approach to the lotus/chamber; no sudden gradients at chapter boundaries.
  return 48.2 + Math.sin(distance / JOURNEY_LENGTH * Math.PI * 4) * 10;
}
export const corridorRadius = (distance: number) => 11 + chamberAt(distance) * 7;
export function inCorridor(s: Pick<FlightState, 'x' | 'y' | 'z'>, wasInside: boolean) {
  const d = distanceAt(s.z), radius = corridorRadius(d) + (wasInside ? FLOW.tolerance : -FLOW.tolerance);
  return Math.hypot(s.x - routeX(d), s.y + BIKE_HIT_HEIGHT - routeY(d)) <= radius;
}
export function tunnelHint(s: FlightState) {
  const d = distanceAt(s.z) + Math.max(35, s.speed * 3);
  return courseEffortHint(s, { x: routeX(d), y: routeY(d), z: 110 - d, radius: 11, hit: false, kind: 'ring' });
}
/** Uses unchanged lift/effort physics; assistance acts only on horizontal steering. */
export function stepTunnel(s: FlightState, effort: number, dt: number) {
  const ahead = Math.max(30, s.speed * 2), dx = routeX(distanceAt(s.z) + ahead) - s.x;
  const steer = clamp((Math.atan2(dx, ahead) - s.heading) * 4 - s.bank * .9, -1, 1);
  stepFlight(s, { steer, pitch: 0 }, effort, dt, 4);
}
export interface FlowState {
  score: number; inside: boolean; streak: number; charge: number; outside: number;
  accumulated: number; multiplier: number; ripple: number; wave: number; lastLotus: number;
}
export const initialFlow = (): FlowState => ({ score: 0, inside: true, streak: 0, charge: 0, outside: 0, accumulated: 0, multiplier: 1, ripple: -100, wave: -100, lastLotus: -1 });
export function lotusOpening(distanceTo: number, flow: number) {
  const approach = clamp((540 - distanceTo) / 500, 0, 1);
  // Guaranteed aperture well before arrival, independently of performance.
  return clamp(approach * (.8 + .2 * clamp(flow / 30, 0, 1)), 0, 1);
}
/** Call with simulation time only. Invalid/large gaps and pause accrue nothing. */
export function stepFlow(flow: FlowState, s: FlightState, dt: number, running = true, activeInput = true) {
  if (!running || !Number.isFinite(dt) || dt <= 0 || dt > .1) return;
  const inside = inCorridor(s, flow.inside), previouslyInside = flow.inside;
  flow.inside = inside;
  if (inside && !previouslyInside) flow.ripple = s.elapsed;
  if (inside && activeInput) {
    if (flow.outside > 0) flow.streak = 0;
    flow.outside = 0;
    const before = flow.streak;
    flow.streak += dt; flow.charge = Math.min(30, flow.charge + dt);
    flow.multiplier = flow.streak + 1e-8 >= FLOW.tripleAt ? 3 : flow.streak + 1e-8 >= FLOW.doubleAt ? 2 : flow.multiplier;
    if (before < 30 && flow.streak >= 30) flow.wave = s.elapsed;
    flow.accumulated += dt;
    if (flow.accumulated + 1e-8 >= FLOW.interval) { flow.accumulated = Math.max(0, flow.accumulated - FLOW.interval); flow.score += FLOW.points * flow.multiplier; }
  } else {
    flow.outside += dt; flow.charge = Math.max(0, flow.charge - dt * FLOW.drain);
    if (flow.outside + 1e-8 >= FLOW.resetAfter) { flow.streak = 0; flow.multiplier = 1; }
  }
  const d = distanceAt(s.z), encounter = Math.floor((d - 2760) / JOURNEY_LENGTH);
  if (encounter >= 0 && encounter > flow.lastLotus) {
    flow.lastLotus = encounter;
    if (inside && activeInput && flow.charge >= 15) { flow.score += FLOW.lotusBonus * flow.multiplier; flow.wave = s.elapsed; }
  }
}
