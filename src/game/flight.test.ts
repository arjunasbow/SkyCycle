import { describe, expect, it } from 'vitest';
import { SimulatedBike } from '../bike/simulated';
import { BaseAdapter, type BikeState } from '../bike/types';
import { collectTargets, DEFAULT_CALIBRATION, FlightInputAdapter, initialFlight, stepFlight } from './flight';
class TestBike extends BaseAdapter { async connect() {} disconnect() { this.update({ status: 'disconnected', sample: { timestamp: 1000 } }); } update(s: BikeState) { this.emit(s); } }
describe('flight bike input and physics', () => {
  it('maps comfortable power, supports cadence-only devices and caps excessive power', () => {
    const bike = new TestBike(), input = new FlightInputAdapter(bike);
    bike.update({ status: 'connected', sample: { timestamp: 1000, watts: 80, cadence: 60 } }); expect(input.effort(1500, DEFAULT_CALIBRATION)).toBe(1);
    bike.update({ status: 'connected', sample: { timestamp: 1000, cadence: 60 } }); expect(input.effort(1500, DEFAULT_CALIBRATION)).toBe(1);
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
});
