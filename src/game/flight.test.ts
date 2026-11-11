import { describe, expect, it } from 'vitest';
import { SimulatedBike } from '../bike/simulated';
import { BaseAdapter, type BikeState } from '../bike/types';
import { assistedSteering, collectTargets, courseEffortHint, createCourse, DEFAULT_CALIBRATION, DEFAULT_RIDE_SECONDS, FlightInputAdapter, initialFlight, stepFlight, timedRideFinished, wrapCourse } from './flight';
class TestBike extends BaseAdapter { async connect() {} disconnect() { this.update({ status: 'disconnected', sample: { timestamp: 1000 } }); } update(s: BikeState) { this.emit(s); } }
describe('flight bike input and physics', () => {
  it('maps comfortable power, supports cadence-only devices and caps excessive power', () => {
    const bike = new TestBike(), input = new FlightInputAdapter(bike);
    bike.update({ status: 'connected', sample: { timestamp: 1000, watts: 45, cadence: 80 } }); expect(input.effort(1500, DEFAULT_CALIBRATION)).toBe(1);
    bike.update({ status: 'connected', sample: { timestamp: 1000, cadence: 80 } }); expect(input.effort(1500, DEFAULT_CALIBRATION)).toBe(1);
    bike.update({ status: 'connected', sample: { timestamp: 1000, watts: 900 } }); expect(input.effort(1500, DEFAULT_CALIBRATION)).toBe(1.5); input.dispose();
  });
  it('rejects stale per-field cadence, stationary pedals, disconnected and invalid data', () => {
    const bike = new TestBike(), input = new FlightInputAdapter(bike);
    bike.update({ status: 'connected', sample: { timestamp: 5000, cadenceAt: 1000, cadence: 60, watts: 100 } }); expect(input.effort(5000, DEFAULT_CALIBRATION)).toBe(0);
    bike.update({ status: 'connected', sample: { timestamp: 5000, cadence: 0, watts: 100 } }); expect(input.effort(5000, DEFAULT_CALIBRATION)).toBe(0);
    bike.update({ status: 'connected', sample: { timestamp: 5000, watts: NaN } }); expect(input.effort(5000, DEFAULT_CALIBRATION)).toBe(0);
    bike.disconnect(); expect(input.effort(5000, DEFAULT_CALIBRATION)).toBe(0); input.dispose();
  });
  it('uses simulation through exactly the same interface', async () => {
    const bike = new SimulatedBike(), input = new FlightInputAdapter(bike); await bike.connect();
    expect(input.effort(Date.now(), DEFAULT_CALIBRATION)).toBeGreaterThan(0); bike.set(0, 100); expect(input.effort(Date.now(), DEFAULT_CALIBRATION)).toBe(0); bike.disconnect(); input.dispose();
  });
  it('decays thrust and glides down after loss of input without instant speed loss', () => {
    const s = initialFlight(); for (let i = 0; i < 600; i++) stepFlight(s, { steer: 0, pitch: 0 }, 1, 1 / 60);
    const speed = s.speed, y = s.y; stepFlight(s, { steer: 0, pitch: 0 }, 0, 1 / 60); expect(s.speed).toBeGreaterThan(speed * .99);
    for (let i = 0; i < 600; i++) stepFlight(s, { steer: 0, pitch: 0 }, 0, 1 / 60);
    expect(s.thrust).toBeLessThan(.01); expect(s.y).toBeLessThan(y); expect(s.verticalSpeed).toBeGreaterThanOrEqual(-5);
  });
  it('keeps motion stable across frame rates and respects ground', () => {
    const run = (fps: number) => { const s = initialFlight(); for (let i = 0; i < fps * 10; i++) stepFlight(s, { steer: .2, pitch: .1 }, 1, 1 / fps); return s; };
    expect(Math.abs(run(30).z - run(120).z)).toBeLessThan(2);
    const s = initialFlight(); for (let i = 0; i < 6000; i++) stepFlight(s, { steer: 0, pitch: 0 }, 0, 1 / 60); expect(s.y).toBeGreaterThanOrEqual(4);
  });
  it('scores a crossed ring once and ignores misses', () => {
    const targets = [{ x: 0, y: 20, z: -10, radius: 8, hit: false, kind: 'ring' as const }];
    expect(collectTargets({ x: 0, y: 20, z: 0 }, { x: 0, y: 20, z: -20 }, targets)).toBe(100);
    expect(collectTargets({ x: 0, y: 20, z: 0 }, { x: 0, y: 20, z: -20 }, targets)).toBe(0);
    targets[0].hit = false; expect(collectTargets({ x: 20, y: 20, z: 0 }, { x: 20, y: 20, z: -20 }, targets)).toBe(0);
  });
  it('assisted steering follows horizontal targets without changing pitch or auto-awarding scores', () => {
    const s = initialFlight(), target = { x: 45, y: 150, z: -150, radius: 9.5, hit: false, kind: 'ring' as const };
    expect(assistedSteering(s, [target])).toBeGreaterThan(0);
    for (let i = 0; i < 1800 && s.z > target.z; i++) stepFlight(s, { steer: assistedSteering(s, [target]), pitch: 0 }, 1, 1 / 60);
    expect(Math.abs(s.x - target.x)).toBeLessThan(5); expect(s.pitch).toBe(0); expect(target.hit).toBe(false);
    expect(assistedSteering({ x: 40, z: 0, heading: 0, bank: 0 }, [])).toBeLessThan(0);
  });
  it('holds altitude at 45 W and reverses a climb within one second at 40 W or stopped pedals', () => {
    const s = { ...initialFlight(), speed: 21, thrust: 1 };
    for (let i = 0; i < 600; i++) stepFlight(s, { steer: 0, pitch: 0 }, 1, 1 / 60);
    expect(s.y).toBeCloseTo(45, 4);
    for (let i = 0; i < 180; i++) stepFlight(s, { steer: 0, pitch: 0 }, 50 / 45, 1 / 60);
    expect(s.verticalSpeed).toBeGreaterThan(.8);
    const climbing = { ...s }, startY = s.y;
    for (let i = 0; i < 60; i++) stepFlight(s, { steer: 0, pitch: 0 }, 40 / 45, 1 / 60);
    expect(s.verticalSpeed).toBeLessThan(-.5); expect(s.y).toBeLessThan(startY + .2);
    for (let i = 0; i < 60; i++) stepFlight(climbing, { steer: 0, pitch: 0 }, 0, 1 / 60);
    expect(climbing.verticalSpeed).toBeLessThan(-2); expect(climbing.speed).toBeGreaterThan(15);
  });
  it('makes the entire course achievable with continuous modest effort around 45 W', () => {
    const targets = createCourse(), s = initialFlight(); let score = 0, minWatts = 45, maxWatts = 45;
    for (let i = 0; i < 60 * 150 && s.z > -2400; i++) {
      const next = targets.find(t => !t.hit && t.z < s.z), effort = courseEffortHint(s, next), previous = { ...s };
      minWatts = Math.min(minWatts, effort * 45); maxWatts = Math.max(maxWatts, effort * 45);
      stepFlight(s, { steer: assistedSteering(s, targets), pitch: 0 }, effort, 1 / 60);
      score += collectTargets(previous, s, targets);
    }
    expect(score).toBe(2600); expect(minWatts).toBeGreaterThan(35); expect(maxWatts).toBeLessThan(55);
    expect(minWatts).toBeLessThan(43); expect(maxWatts).toBeGreaterThan(47);
  });
  it('scores the visible rider passing a ring even when the old ground-reference point misses', () => {
    const target = { x: 0, y: 8, z: 0, radius: 6, hit: false, kind: 'ring' as const }, hits: number[] = [];
    expect(collectTargets({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -10 }, [target], hit => hits.push(hit.points))).toBe(100);
    expect(hits).toEqual([100]);
    expect(collectTargets({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -10 }, [target])).toBe(0);
  });
  it('scores balloon surface contact before its center plane and catches fast swept collisions', () => {
    const target = { x: 0, y: 0, z: 0, radius: 6, hit: false, kind: 'balloon' as const };
    expect(collectTargets({ x: 6, y: 0, z: 20 }, { x: 6, y: 0, z: 5 }, [target])).toBe(250);
    target.hit = false; expect(collectTargets({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: -100 }, [target])).toBe(250);
    target.hit = false; expect(collectTargets({ x: 25, y: 0, z: 100 }, { x: 25, y: 0, z: -100 }, [target])).toBe(0);
  });
  it('keeps a timed ride running for five minutes across multiple valley laps with score preserved', () => {
    const s = initialFlight(), targets = createCourse(); let score = 0, laps = 0, steps = 0;
    while (!timedRideFinished('arcade', s.elapsed) && steps++ < 60 * 301) {
      const next = targets.find(t => !t.hit && t.z < s.z), previous = { ...s };
      stepFlight(s, { steer: assistedSteering(s, targets), pitch: 0 }, courseEffortHint(s, next), 1 / 60);
      score += collectTargets(previous, s, targets); if (wrapCourse(s, targets)) laps++;
    }
    expect(DEFAULT_RIDE_SECONDS).toBe(300); expect(s.elapsed).toBeCloseTo(300, 1); expect(laps).toBeGreaterThanOrEqual(2); expect(score).toBeGreaterThan(5200);
    expect(timedRideFinished('arcade', 299.9)).toBe(false); expect(timedRideFinished('scenic', 900)).toBe(false);
  });
});
