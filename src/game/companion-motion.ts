import { MathUtils, Vector3 } from 'three';
/** Bird entrances and departures share the lower-right edge, rising into formation beside the bike. */
export function companionOffset(out: Vector3, presence: number, time: number, reduced: boolean, height = 4.8) {
  const away = 1 - MathUtils.smoothstep(presence, 0, 1), t = reduced ? 0 : time;
  return out.set(4.4 + Math.sin(t * .7) * 1.5 + away * 24, height + Math.sin(t * 1.8) * .7 + Math.sin(t * .41) * .6 - away * 21, -7 + Math.sin(t * .43) * 2 + away * 8);
}
