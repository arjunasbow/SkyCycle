/** Bluetooth SIG fields are little-endian; flag bits are presence bits except FTMS bit 0. */
export type Measurement = Record<string, number>;
class Reader {
  offset = 0;
  constructor(private view: DataView) {}
  read(size: number, signed = false) {
    if (this.offset + size > this.view.byteLength) throw new Error(`Truncated measurement at byte ${this.offset}: need ${size} bytes`);
    const o = this.offset; this.offset += size;
    if (size === 1) return signed ? this.view.getInt8(o) : this.view.getUint8(o);
    if (size === 2) return signed ? this.view.getInt16(o, true) : this.view.getUint16(o, true);
    if (size === 3) return this.view.getUint8(o) | this.view.getUint8(o + 1) << 8 | this.view.getUint8(o + 2) << 16;
    return this.view.getUint32(o, true);
  }
}
export type ResistanceFormat = 'auto' | 'gss2026' | 'legacy-ftms';
function indoorBikeLength(flags: number, resistanceBytes: number) {
  let length = 2 + (flags & 1 ? 0 : 2);
  for (const [bit, bytes] of [[1, 2], [2, 2], [3, 2], [4, 3], [5, resistanceBytes], [6, 2], [7, 2], [8, 5], [9, 1], [10, 1], [11, 2], [12, 2]]) if (flags & 1 << bit) length += bytes;
  return length;
}
/** Select between published FTMS layouts using exact flag-defined length, never watt magnitude. */
function validateIndoorBikeLayout(flags: number, length: number, format: ResistanceFormat): number {
  if (flags & 0xe000) throw new Error('Unsupported reserved FTMS flags; raw data only.');
  const one = indoorBikeLength(flags, 1), two = indoorBikeLength(flags, 2);
  if (format === 'auto') {
    if (length === one) return flags & 32 ? 1 : 0;
    if (length === two) return 2;
  } else {
    const expected = format === 'gss2026' ? one : two;
    if (length === expected) return flags & 32 ? format === 'gss2026' ? 1 : 2 : 0;
    if (flags & 32 && (length === one || length === two)) throw new Error(`FTMS resistance layout mismatch: packet length matches ${length === two ? 'legacy-ftms (2-byte)' : 'gss2026 (1-byte)'}. Select Auto or the matching layout in Bike diagnostics.`);
  }
  throw new Error(`${length < Math.min(one, two) ? 'Truncated' : 'Unexpected'} FTMS measurement: got ${length} bytes; flags require ${one === two ? one : `${one} or ${two}`} bytes. Raw data only.`);
}
export function parseIndoorBike(view: DataView, resistanceFormat: ResistanceFormat = 'auto'): Measurement {
  const r = new Reader(view), flags = r.read(2), m: Measurement = { flags };
  const resistanceBytes = validateIndoorBikeLayout(flags, view.byteLength, resistanceFormat);
  if (!(flags & 1)) m.speedKph = r.read(2) / 100;
  if (flags & 2) m.averageSpeedKph = r.read(2) / 100;
  if (flags & 4) m.cadence = r.read(2) / 2;
  if (flags & 8) m.averageCadence = r.read(2) / 2;
  if (flags & 16) m.distanceM = r.read(3);
  // GATT Specification Supplement 2026-09-09, §3.139: uint8.
  if (flags & 32) { m.resistanceBytes = resistanceBytes; m.resistance = r.read(resistanceBytes, resistanceBytes === 2); }
  if (flags & 64) m.watts = r.read(2, true);
  if (flags & 128) m.averageWatts = r.read(2, true);
  if (flags & 256) { m.energyKcal = r.read(2); m.energyPerHour = r.read(2); m.energyPerMinute = r.read(1); }
  if (flags & 512) m.heartRate = r.read(1);
  if (flags & 1024) m.metabolicEquivalent = r.read(1) / 10;
  if (flags & 2048) m.elapsedSeconds = r.read(2);
  if (flags & 4096) m.remainingSeconds = r.read(2);
  return m;
}
export function parseCSC(view: DataView): Measurement {
  const r = new Reader(view), flags = r.read(1), m: Measurement = { flags };
  if (flags & 1) { m.wheelRevolutions = r.read(4); m.wheelEventTime = r.read(2); }
  if (flags & 2) { m.crankRevolutions = r.read(2); m.crankEventTime = r.read(2); }
  return m;
}
export function parsePower(view: DataView): Measurement {
  const r = new Reader(view), flags = r.read(2), m: Measurement = { flags, watts: r.read(2, true) };
  if (flags & 1) m.pedalBalance = r.read(1) / 2;
  if (flags & 4) m.accumulatedTorque = r.read(2) / 32;
  if (flags & 16) { m.wheelRevolutions = r.read(4); m.wheelEventTime = r.read(2); }
  if (flags & 32) { m.crankRevolutions = r.read(2); m.crankEventTime = r.read(2); }
  if (flags & 64) { m.maximumForce = r.read(2, true); m.minimumForce = r.read(2, true); }
  if (flags & 128) { m.maximumTorque = r.read(2, true) / 32; m.minimumTorque = r.read(2, true) / 32; }
  if (flags & 256) { const angles = r.read(3); m.maximumAngle = angles & 4095; m.minimumAngle = angles >>> 12; }
  if (flags & 512) m.topDeadSpotAngle = r.read(2);
  if (flags & 1024) m.bottomDeadSpotAngle = r.read(2);
  if (flags & 2048) m.accumulatedEnergyKJ = r.read(2);
  return m;
}
export function parseHeartRate(view: DataView): Measurement {
  const r = new Reader(view), flags = r.read(1), m: Measurement = { flags, heartRate: r.read(flags & 1 ? 2 : 1) };
  if (flags & 8) m.energyKJ = r.read(2);
  if (flags & 16) { let i = 0; while (r.offset < view.byteLength) m[`rrSeconds${i++}`] = r.read(2) / 1024; }
  return m;
}
export function shortUUID(uuid: string): string { return uuid.toLowerCase().replace(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/, '$1'); }
export function parseMeasurement(uuid: string, view: DataView, resistanceFormat: ResistanceFormat = 'auto'): Measurement | undefined {
  switch (shortUUID(uuid)) {
    case '2ad2': return parseIndoorBike(view, resistanceFormat);
    case '2a63': return parsePower(view);
    case '2a5b': return parseCSC(view);
    case '2a37': return parseHeartRate(view);
    case '2a19': return { batteryPercent: new Reader(view).read(1) };
    default: return undefined;
  }
}
/** Per-characteristic history; crank time is 1/1024 s for both CSC and CPS. */
export class CadenceTracker {
  private previous?: { revolutions: number; ticks: number; received: number };
  update(m: Measurement, now: number): number | undefined {
    if (m.crankRevolutions === undefined) return;
    const next = { revolutions: m.crankRevolutions, ticks: m.crankEventTime, received: now }, prev = this.previous;
    this.previous = next;
    if (!prev || now - prev.received > 60_000) return;
    const revolutions = (next.revolutions - prev.revolutions + 65536) % 65536;
    const ticks = (next.ticks - prev.ticks + 65536) % 65536;
    if (ticks === 0) return revolutions === 0 ? undefined : 0;
    const rpm = revolutions * 60 * 1024 / ticks;
    return rpm <= 250 ? rpm : undefined;
  }
}
export function hex(view: DataView) { return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), b => b.toString(16).padStart(2, '0')).join(' '); }
