import { clamp, type FlightState } from './flight';

export type RaceDifficulty = 'gentle' | 'moderate' | 'challenging';
export const ROAD_LENGTH = 2600;
export const ROAD_SPEED = 6.5;
export const RIDER_NAMES = ['Maya', 'Leo', 'Robin', 'Ari', 'Sam'];
export interface Rival { name: string; distance: number; speed: number; effort: number; nextMove: number; }
export interface RaceState { distance: number; speed: number; elapsed: number; riders: Rival[]; seed: number; }
export const roadX = (distance: number) => Math.sin(distance * Math.PI * 2 / ROAD_LENGTH) * 48 + Math.sin(distance * Math.PI * 4 / ROAD_LENGTH) * 16;
export const roadHeading = (distance: number) => Math.atan((roadX(distance + 1) - roadX(distance - 1)) / 2);
export function initialRace(): RaceState {
  return { distance: 0, speed: 0, elapsed: 0, seed: 714, riders: RIDER_NAMES.map((name, i) => ({ name, distance: (i - 2) * 7, speed: 0, effort: 1, nextMove: 3 + i * 2 })) };
}
const random = (race: RaceState) => { race.seed = (race.seed * 1664525 + 1013904223) >>> 0; return race.seed / 4294967296; };
/** Fictional rivals use bounded efforts and continuous motion, never position teleports. */
export function stepRace(race: RaceState, effort: number, difficulty: RaceDifficulty, dt: number) {
  dt = clamp(dt, 0, 1 / 30); race.elapsed += dt;
  const response = 1 - Math.exp(-dt * 1.8);
  race.speed += (ROAD_SPEED * Math.sqrt(clamp(effort, 0, 1.5)) - race.speed) * response;
  race.distance += race.speed * dt;
  const baseline = difficulty === 'gentle' ? .9 : difficulty === 'challenging' ? 1.1 : 1;
  race.riders.forEach((rider, i) => {
    if (race.elapsed >= rider.nextMove) {
      rider.effort = baseline + (i - 2) * .018 + (random(race) - .5) * .16;
      rider.nextMove = race.elapsed + 8 + random(race) * 12;
    }
    // Pack-wide surges alternate with recovery. A small bounded adjustment keeps
    // distant riders approachable without mirroring the player's live effort.
    const wave = Math.sin(race.elapsed * Math.PI / 24) * .045;
    const regroup = clamp((race.distance - rider.distance) / 1000, -.05, .05);
    const target = ROAD_SPEED * Math.sqrt(clamp(rider.effort + wave + regroup, .75, 1.3));
    rider.speed += (target - rider.speed) * response; rider.distance += rider.speed * dt;
  });
}
export function racePosition(race: RaceState) { return 1 + race.riders.filter(r => r.distance > race.distance).length; }
export function raceGuidance(race: RaceState) {
  const ahead = race.riders.filter(r => r.distance > race.distance).sort((a, b) => a.distance - b.distance)[0];
  if (!ahead) return { target: 'You lead the group. Settle into your rhythm.', effort: 1 };
  const gap = ahead.distance - race.distance;
  return { target: `${ahead.name} · ${Math.ceil(gap)} m ahead · ${gap > 18 ? 'Catch the group' : 'A gentle surge to pass'}`, effort: gap > 18 ? 1.1 : 1.05 };
}
/** Reuses the chase camera pose, while keeping road physics separate from flight. */
export function racePose(race: RaceState, pose: FlightState) {
  const distance = race.distance % ROAD_LENGTH;
  pose.x = roadX(distance); pose.y = .2; pose.z = 110 - distance;
  pose.heading = roadHeading(distance); pose.bank = 0; pose.pitch = 0;
  pose.speed = race.speed; pose.elapsed = race.elapsed; pose.thrust = race.speed / ROAD_SPEED;
}
