import { clamp, DEFAULT_RIDE_SECONDS, type FlightState } from './flight';

export type RaceDifficulty = 'gentle' | 'moderate' | 'challenging';
export type RiderPhase = 'cruise' | 'attack' | 'recover';
export const ROAD_LENGTH = 2600;
export const ROAD_SPEED = 6.5;
export const RIDER_NAMES = ['Maya', 'Leo', 'Robin', 'Ari', 'Sam'];
export const RIDER_PERSONALITIES = ['Sprinter', 'Endurance', 'Attacker', 'Conserver', 'Wildcard'];
export interface Rival { name: string; distance: number; speed: number; effort: number; nextMove: number; phase: RiderPhase; lane: number; }
export interface RaceState { distance: number; speed: number; elapsed: number; riders: Rival[]; seed: number; }
const angle = (distance: number) => distance * Math.PI * 2 / ROAD_LENGTH;
export const roadX = (distance: number) => Math.sin(angle(distance)) * 48 + Math.sin(angle(distance) * 2) * 16;
export const roadHeight = (distance: number) => 4 * Math.sin(angle(distance)) + 2 * Math.sin(angle(distance) * 3);
export const roadGrade = (distance: number) => (roadHeight(distance + 1) - roadHeight(distance - 1)) / 2;
export const roadHeading = (distance: number) => Math.atan((roadX(distance + 1) - roadX(distance - 1)) / 2);
// Separate passing lines have >1.5m clearance for the scaled bicycle models.
export const RIDER_LANES = [-5.2, -3.1, 1.9, 4, 6];
export function initialRace(): RaceState {
  return { distance: 0, speed: 0, elapsed: 0, seed: 714, riders: RIDER_NAMES.map((name, i) => ({ name, distance: (i - 2) * 7, speed: 0, effort: 1, phase: 'cruise', lane: RIDER_LANES[i], nextMove: 3 + i * 2 })) };
}
const random = (race: RaceState) => { race.seed = (race.seed * 1664525 + 1013904223) >>> 0; return race.seed / 4294967296; };
const profiles = [
  { attack: 7, recover: 14, cruise: 15, burst: 1.85, rest: .66, steady: .98 },
  { attack: 18, recover: 8, cruise: 22, burst: 1.16, rest: .86, steady: 1.01 },
  { attack: 12, recover: 16, cruise: 11, burst: 1.6, rest: .68, steady: 1 },
  { attack: 10, recover: 18, cruise: 18, burst: 1.55, rest: .78, steady: 1.01 },
  { attack: 9, recover: 13, cruise: 12, burst: 1.7, rest: .67, steady: .99 },
];
/** Continuous, seeded AI with attacks and recovery. Player power calibration is unchanged. */
export function stepRace(race: RaceState, effort: number, difficulty: RaceDifficulty, dt: number, timed = false) {
  dt = clamp(dt, 0, 1 / 30);
  if (timed) dt = Math.min(dt, Math.max(0, DEFAULT_RIDE_SECONDS - race.elapsed));
  if (!dt) return; race.elapsed += dt;
  if (timed && race.elapsed > DEFAULT_RIDE_SECONDS - 1e-8) race.elapsed = DEFAULT_RIDE_SECONDS;
  const response = 1 - Math.exp(-dt * 1.8);
  race.speed += (ROAD_SPEED * Math.sqrt(clamp(effort, 0, 1.5)) - race.speed) * response;
  race.distance += race.speed * dt;
  const baseline = difficulty === 'gentle' ? .93 : difficulty === 'challenging' ? 1.065 : .985;
  race.riders.forEach((rider, i) => {
    const profile = profiles[i];
    if (race.elapsed >= rider.nextMove) {
      rider.phase = rider.phase === 'cruise' ? 'attack' : rider.phase === 'attack' ? 'recover' : 'cruise';
      const jitter = .85 + random(race) * .3;
      rider.effort = (rider.phase === 'attack' ? profile.burst : rider.phase === 'recover' ? profile.rest : profile.steady) + (random(race) - .5) * (i === 4 ? .28 : .06);
      rider.nextMove = race.elapsed + profile[rider.phase] * jitter;
    }
    // Bounded catch-up acts on speed, never distance; riders can get well ahead.
    const regroup = clamp((race.distance - rider.distance) / 160, -.2, .2);
    const finishBoost = timed ? clamp((race.elapsed - (DEFAULT_RIDE_SECONDS - 20)) / 8, 0, 1) * [ .3, .05, .12, .06, .1 ][i] : 0;
    const target = ROAD_SPEED * baseline * Math.sqrt(clamp(rider.effort + regroup + finishBoost, .45, 2.15));
    const acceleration = rider.phase === 'attack' || finishBoost > 0 ? 1.05 : .7;
    rider.speed += (target - rider.speed) * (1 - Math.exp(-dt * acceleration)); rider.distance += rider.speed * dt;
    const desiredLane = RIDER_LANES[i] + Math.sin(race.elapsed * .22 + i * 2) * .22;
    rider.lane += (desiredLane - rider.lane) * (1 - Math.exp(-dt * .7));
  });
}
export function racePosition(race: RaceState) { return 1 + race.riders.filter(r => r.distance > race.distance).length; }
export function raceGuidance(race: RaceState, timed = false) {
  let ahead: Rival | undefined;
  for (const rider of race.riders) if (rider.distance > race.distance && (!ahead || rider.distance < ahead.distance)) ahead = rider;
  const sprint = timed && race.elapsed >= DEFAULT_RIDE_SECONDS - 20;
  if (!ahead) return { target: sprint ? 'Final sprint · Hold your lead!' : 'You lead the group. Settle into your rhythm.', effort: 1 };
  const gap = ahead.distance - race.distance;
  return { target: `${sprint ? 'Final sprint · ' : ''}${ahead.name} · ${Math.ceil(gap)} m ahead · ${ahead.phase === 'attack' ? 'Attacking' : ahead.phase === 'recover' ? 'Recovering' : 'Steady pace'}`, effort: gap > 18 ? 1.1 : 1.05 };
}
export function racePose(race: RaceState, pose: FlightState) {
  const distance = race.distance % ROAD_LENGTH;
  pose.x = roadX(distance); pose.y = roadHeight(distance) + .2; pose.z = 110 - distance;
  pose.heading = roadHeading(distance); pose.bank = clamp((roadHeading(distance + 12) - roadHeading(distance - 12)) * 2, -.06, .06); pose.pitch = Math.atan(roadGrade(distance));
  pose.speed = race.speed; pose.elapsed = race.elapsed; pose.thrust = race.speed / ROAD_SPEED;
}
