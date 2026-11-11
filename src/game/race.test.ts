import { expect, it } from 'vitest';
import { initialFlight } from './flight';
import { initialRace, stepRace, racePosition, racePose, raceGuidance, roadX, roadHeading, ROAD_LENGTH, type RaceDifficulty } from './race';
function ride(effort = 1, difficulty: RaceDifficulty = 'moderate', seconds = 300) {
  const race = initialRace(); for (let i = 0; i < seconds * 60; i++) stepRace(race, effort, difficulty, 1 / 60); return race;
}
it('makes comfortable effort competitive and modest surges improve the result', () => {
  const steady = ride(), faster = ride(1.15), recovery = ride(.85);
  expect(racePosition(steady)).toBeGreaterThan(1); expect(racePosition(steady)).toBeLessThan(6);
  expect(racePosition(faster)).toBe(1); expect(racePosition(recovery)).toBe(6);
  expect(steady.distance).toBeGreaterThan(1900); expect(steady.distance).toBeLessThan(2000);
});
it('varies rival efforts predictably, with difficulty and no teleporting', () => {
  const gentle = ride(1, 'gentle'), hard = ride(1, 'challenging');
  expect(racePosition(gentle)).toBeLessThan(racePosition(hard));
  expect(ride()).toEqual(ride());
  const race = initialRace(), efforts = new Set<number>();
  for (let i = 0; i < 3600; i++) {
    const before = race.riders.map(r => r.distance); stepRace(race, 1, 'moderate', 1 / 60);
    race.riders.forEach((r, j) => { expect(r.distance - before[j]).toBeGreaterThanOrEqual(0); expect(r.distance - before[j]).toBeLessThan(.14); efforts.add(r.effort); });
  }
  expect(efforts.size).toBeGreaterThan(12);
});
it('slows promptly when input disappears while other riders continue', () => {
  const race = ride(1, 'moderate', 20), speed = race.speed, rival = race.riders[0].distance;
  for (let i = 0; i < 120; i++) stepRace(race, 0, 'moderate', 1 / 60);
  expect(race.speed).toBeLessThan(speed * .05); expect(race.riders[0].distance).toBeGreaterThan(rival + 10);
});
it('keeps road laps continuous in race distance and provides the next-rider gap', () => {
  const race = ride(1, 'moderate', 900), pose = initialFlight(); racePose(race, pose);
  expect(race.distance).toBeGreaterThan(ROAD_LENGTH * 2); expect(pose.y).toBe(.2);
  expect(pose.x).toBeCloseTo(roadX(race.distance)); expect(pose.elapsed).toBeCloseTo(900);
  expect(roadX(0)).toBeCloseTo(roadX(ROAD_LENGTH)); expect(roadHeading(0)).toBeCloseTo(roadHeading(ROAD_LENGTH));
  expect(raceGuidance(race).target).toMatch(/ahead|lead/);
});
