import { describe, expect, it } from 'vitest';
import { CadenceTracker, hex, parseCSC, parseHeartRate, parseIndoorBike, parseMeasurement, parsePower } from './parsers';
const bytes = (...b: number[]) => new DataView(Uint8Array.from(b).buffer);
describe('standard Bluetooth measurements', () => {
  it('decodes FTMS speed, half-RPM cadence and signed power', () => {
    expect(parseIndoorBike(bytes(0x44, 0, 0xc4, 9, 131, 0, 0xec, 0xff))).toMatchObject({ speedKph: 25, cadence: 65.5, watts: -20 });
  });
  it('handles More Data (no instantaneous speed) and every optional FTMS field', () => {
    const view = new DataView(new ArrayBuffer(32)); view.setUint16(0, 0x1fff, true);
    expect(parseIndoorBike(view)).toMatchObject({ flags: 8191, averageSpeedKph: 0, cadence: 0, remainingSeconds: 0 });
    expect(parseIndoorBike(bytes(1, 0))).toEqual({ flags: 1 });
  });
  it('keeps offsets after resistance, distance and average fields', () => {
    expect(parseIndoorBike(bytes(0x71, 0, 1, 2, 3, 5, 100, 0))).toMatchObject({ distanceM: 0x030201, resistance: 5, watts: 100 });
  });
  it('supports an explicitly selected legacy two-byte resistance layout', () => {
    expect(parseIndoorBike(bytes(0x61, 0, 0xfe, 0xff, 100, 0), 'legacy-ftms')).toMatchObject({ resistance: -2, watts: 100 });
  });
  it('decodes CPS optional fields before crank and signed power', () => {
    expect(parsePower(bytes(0x35, 0, 0xff, 0xff, 100, 64, 0, 3, 0, 0, 0, 0, 8, 12, 0, 0, 4))).toMatchObject({ watts: -1, pedalBalance: 50, accumulatedTorque: 2, crankRevolutions: 12, crankEventTime: 1024 });
  });
  it('decodes CSC wheel and crank independently', () => {
    expect(parseCSC(bytes(3, 1, 0, 0, 0, 0, 4, 2, 0, 0, 8))).toEqual({ flags: 3, wheelRevolutions: 1, wheelEventTime: 1024, crankRevolutions: 2, crankEventTime: 2048 });
    expect(parseCSC(bytes(0))).toEqual({ flags: 0 });
  });
  it('handles crank rollover, duplicates, stale history and impossible RPM', () => {
    const t = new CadenceTracker();
    expect(t.update({ crankRevolutions: 65535, crankEventTime: 65024 }, 0)).toBeUndefined();
    expect(t.update({ crankRevolutions: 0, crankEventTime: 512 }, 1000)).toBe(60);
    expect(t.update({ crankRevolutions: 0, crankEventTime: 512 }, 2000)).toBeUndefined();
    expect(t.update({ crankRevolutions: 1, crankEventTime: 513 }, 3000)).toBeUndefined();
    expect(t.update({ crankRevolutions: 2, crankEventTime: 1537 }, 65000)).toBeUndefined();
  });
  it('rejects truncated packets without displaying misleading values', () => {
    expect(() => parseIndoorBike(bytes(0x44, 0, 0))).toThrow('Truncated');
    expect(() => parsePower(bytes(0, 0, 2))).toThrow('Truncated');
    expect(() => parseCSC(bytes(2, 0))).toThrow('Truncated');
  });
  it('decodes heart rate, preserves DataView offsets and leaves unknown data uninterpreted', () => {
    expect(parseHeartRate(bytes(0x19, 44, 1, 10, 0, 0, 4))).toMatchObject({ heartRate: 300, energyKJ: 10, rrSeconds0: 1 });
    const v = new DataView(Uint8Array.from([255, 1, 2, 255]).buffer, 1, 2);
    expect(hex(v)).toBe('01 02'); expect(parseMeasurement('abcd', v)).toBeUndefined();
  });
});
