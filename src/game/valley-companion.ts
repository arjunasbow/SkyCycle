import { BIKE_HIT_HEIGHT, type FlightState, type Target } from './flight';
export interface ValleyCompanionState { streak: number; inside: boolean; earned: boolean; }
export const initialValleyCompanion = (): ValleyCompanionState => ({ streak: 0, inside: true, earned: false });
/** The invisible route between mandatory targets, with a small steering tolerance. */
export function stepValleyCompanion(state: ValleyCompanionState, previous: FlightState, current: FlightState, targets: Target[], dt: number, running = true, active = true) {
  if (!running || !Number.isFinite(dt) || dt <= 0 || dt > .1) return;
  const route = targets.filter(target => !target.bonus);
  if (!route.length) { state.inside = state.earned = false; state.streak = 0; return; }
  const z = current.z - Math.cos(current.heading) * 1.8;
  let a = route[0], b = a;
  for (let i = 1; i < route.length; i++) {
    if (z <= route[i - 1].z) { a = route[i - 1]; b = route[i]; }
    if (z >= route[i].z) break;
  }
  const t = a.z === b.z ? 0 : Math.max(0, Math.min(1, (a.z - z) / (a.z - b.z)));
  const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
  const offset = Math.hypot(current.x + Math.sin(current.heading) * 1.8 - x, current.y + BIKE_HIT_HEIGHT + Math.sin(current.pitch) * 1.8 - y);
  const missedRing = route.some(target => target.kind === 'ring' && !target.hit && previous.z - Math.cos(previous.heading) * 1.8 >= target.z && z < target.z);
  state.inside = offset <= (state.inside ? 10 : 8);
  if (!state.inside || missedRing || !active) { state.streak = 0; state.earned = false; }
  else { state.streak += dt; state.earned = state.streak + 1e-8 >= 30; }
}
