import { clamp } from './flight';
import { roadHeading, roadHeight, roadX, ROAD_LENGTH, ROAD_SPEED, type RaceState } from './race';

/** Comfortable road-only chase view. Dynamic effects can be disabled during a ride. */
export function roadCameraPose(race: RaceState, dynamic = true) {
  const d = race.distance % ROAD_LENGTH, heading = roadHeading(d);
  const pace = clamp(race.speed / ROAD_SPEED, 0, 1.25), follow = 8.5 + (dynamic ? pace : 0);
  let alongside = 0;
  if (dynamic) for (const rider of race.riders) {
    if (Math.abs(rider.distance - race.distance) < 8) { alongside = clamp(rider.lane * .055, -.4, .4); break; }
  }
  return {
    x: roadX(d) - Math.sin(heading) * follow + alongside,
    y: roadHeight(d - follow) + 3.5,
    z: 110 - d + Math.cos(heading) * follow,
    lookX: roadX(d + 24) + alongside * .3,
    lookY: roadHeight(d + 24) + 2.6,
    lookZ: 110 - d - 24,
    fov: dynamic ? 60 + pace * 4 : 60,
    roll: dynamic ? clamp((roadHeading(d + 16) - roadHeading(d - 16)) * .45, -.018, .018) : 0,
  };
}
