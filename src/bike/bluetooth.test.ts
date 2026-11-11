import { afterEach, describe, expect, it, vi } from 'vitest';
import { BluetoothBike, bluetoothError, localBluetoothErrorDetail } from './bluetooth';
function fixture() {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  const characteristic = Object.assign(new EventTarget(), {
    uuid: '00002ad2-0000-1000-8000-00805f9b34fb', service: { uuid: '00001826-0000-1000-8000-00805f9b34fb' },
    properties: { read: false, notify: true, indicate: false },
    value: new DataView(Uint8Array.from([0x44, 0, 0, 0, 130, 0, 85, 0]).buffer),
    startNotifications: vi.fn().mockResolvedValue(undefined), writeValue: vi.fn()
  });
  const service = { uuid: characteristic.service.uuid, getCharacteristics: vi.fn().mockResolvedValue([characteristic]) };
  const server = { getPrimaryServices: vi.fn().mockRejectedValue(new DOMException('', 'SecurityError')), getPrimaryService: vi.fn(async (id: number) => { if (id === 0x1826) return service; throw new DOMException('', 'NotFoundError'); }), disconnect: vi.fn(), connect: vi.fn() };
  server.connect.mockResolvedValue(server);
  const device = Object.assign(new EventTarget(), { name: 'PRIVATE NAME', id: 'PRIVATE ID', gatt: server });
  const requestDevice = vi.fn().mockResolvedValue(device);
  vi.stubGlobal('window', { isSecureContext: true }); vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
  return { characteristic, device, requestDevice, server };
}
afterEach(() => vi.unstubAllGlobals());
describe('read-only Bluetooth lifecycle', () => {
  it('probes explicit services when enumeration fails, subscribes and resets on disconnect', async () => {
    const f = fixture(), bike = new BluetoothBike(); await bike.connect();
    expect(f.requestDevice).toHaveBeenCalledWith(expect.objectContaining({ acceptAllDevices: true, optionalServices: expect.arrayContaining(['00001826-0000-1000-8000-00805f9b34fb', '00001818-0000-1000-8000-00805f9b34fb', '00001816-0000-1000-8000-00805f9b34fb']) }));
    expect(bike.characteristics).toHaveLength(1); expect(f.characteristic.startNotifications).toHaveBeenCalledOnce();
    f.characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    expect(bike.getState().sample).toMatchObject({ cadence: 65, watts: 85 });
    expect(f.characteristic.writeValue).not.toHaveBeenCalled();
    f.device.dispatchEvent(new Event('gattserverdisconnected'));
    expect(bike.getState()).toMatchObject({ status: 'disconnected', sample: { cadence: 0, watts: 0 } });
    expect(bike.characteristics).toHaveLength(0);
    f.characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    expect(bike.getState().status).toBe('disconnected');
    expect(bike.exportLog()).not.toMatch(/PRIVATE NAME|PRIVATE ID/);
  });
  it('reports permission denial and missing browser support explicitly', async () => {
    const f = fixture(); f.requestDevice.mockRejectedValue(new DOMException('SECRET', 'NotAllowedError'));
    const bike = new BluetoothBike(); await bike.connect();
    expect(bike.getState().error).toContain('permission denied'); expect(bike.exportLog()).not.toContain('SECRET');
    vi.stubGlobal('navigator', {}); await bike.connect(); expect(bike.getState().error).toContain('unavailable');
  });
  it('omits raw unknown data and heart rate from downloadable diagnostics', () => {
    const bike = new BluetoothBike();
    bike.entries.push({ elapsedMs: 1, kind: 'measurement', characteristic: 'vendor-uuid', hex: '53 45 43 52 45 54', values: { secret: 123 } });
    bike.entries.push({ elapsedMs: 2, kind: 'measurement', characteristic: '2ad2', hex: 'ff', values: { cadence: 65, heartRate: 140 } });
    const parsed = JSON.parse(bike.exportLog());
    expect(parsed.entries[0].hex).toBeUndefined(); expect(parsed.entries[0].values).toBeUndefined();
    expect(parsed.entries[1].values).toEqual({ cadence: 65 });
  });
  it('bounds diagnostic memory', () => {
    const bike = new BluetoothBike();
    // Exercise the event sink without Bluetooth hardware.
    for (let i = 0; i < 900; i++) (bike as unknown as { log(e: object): void }).log({ kind: 'status' });
    expect(bike.entries).toHaveLength(800);
  });
  it('preserves bridge string errors locally and identifies failure before device selection', async () => {
    const f = fixture(); f.requestDevice.mockRejectedValue('Native bridge failed PRIVATE DATA');
    const bike = new BluetoothBike(); await bike.connect();
    expect(bike.getState().error).toContain('device selection (before GATT connection)');
    expect(bike.getState().errorDetail).toBe('Native bridge failed PRIVATE DATA');
    expect(bike.exportLog()).not.toContain('PRIVATE DATA');
    expect(f.server.connect).not.toHaveBeenCalled();
  });
  it('recognizes plain-object browser errors and distinguishes GATT failure', async () => {
    const f = fixture(); f.server.connect.mockRejectedValue({ name: 'NetworkError', message: 'Native connection error SECRET' });
    const bike = new BluetoothBike(); await bike.connect();
    expect(bike.getState().error).toContain('GATT connection (after device selection)');
    expect(bike.getState().error).toContain('connection lost');
    expect(bike.getState().errorDetail).toContain('SECRET');
    expect(bike.exportLog()).not.toContain('SECRET');
    expect(bluetoothError({ name: 'NotAllowedError' })).toContain('permission denied');
    expect(localBluetoothErrorDetail(undefined)).toContain('no error details');
  });
  it('offers a picker-only test without optional services, GATT or device identifiers', async () => {
    const f = fixture(), bike = new BluetoothBike(); await bike.connect([], true);
    expect(f.requestDevice).toHaveBeenCalledWith({ acceptAllDevices: true });
    expect(f.server.connect).not.toHaveBeenCalled();
    expect(bike.getState().notice).toContain('Picker test succeeded');
    expect(bike.getState().status).toBe('disconnected');
    expect(bike.exportLog()).not.toMatch(/PRIVATE NAME|PRIVATE ID/);
    expect(bike.getSavedBike()).toBeUndefined();
  });
  it('remembers a successful bike locally and reconnects in-session without another picker', async () => {
    const f = fixture(), bike = new BluetoothBike(); await bike.connect();
    expect(bike.getSavedBike()).toMatchObject({ id: 'PRIVATE ID', name: 'PRIVATE NAME' });
    bike.disconnect(); await bike.connect([], false, true);
    expect(f.requestDevice).toHaveBeenCalledOnce(); expect(f.server.connect).toHaveBeenCalledTimes(2);
    expect(bike.exportLog()).not.toMatch(/PRIVATE NAME|PRIVATE ID/);
    bike.forgetSavedBike(); expect(bike.getSavedBike()).toBeUndefined();
  });
  it('retrieves only the exact saved device after reload, even among several devices', async () => {
    const f = fixture(); const first = new BluetoothBike(); await first.connect(); first.disconnect();
    const getDevices = vi.fn().mockResolvedValue([{ id: 'OTHER ID' }, f.device]);
    Object.assign(navigator.bluetooth, { getDevices });
    const reloaded = new BluetoothBike(); await reloaded.connect([], false, true);
    expect(getDevices).toHaveBeenCalledOnce(); expect(f.requestDevice).toHaveBeenCalledOnce();
    expect(reloaded.getState().status).toBe('connected');
  });
  it('falls back to a name-filtered picker when saved-device retrieval is unavailable', async () => {
    const f = fixture(), first = new BluetoothBike(); await first.connect(); first.disconnect();
    const reloaded = new BluetoothBike(); await reloaded.connect([], false, true);
    expect(f.requestDevice).toHaveBeenLastCalledWith(expect.objectContaining({ filters: [{ name: 'PRIVATE NAME' }] }));
    expect(bikeNameInExport(reloaded)).toBe(false);
  });
  it('does not silently choose another authorized device or launch a picker after an async lookup', async () => {
    const f = fixture(), first = new BluetoothBike(); await first.connect(); first.disconnect();
    Object.assign(navigator.bluetooth, { getDevices: vi.fn().mockResolvedValue([{ id: 'OTHER ID' }]) });
    const reloaded = new BluetoothBike(); await reloaded.connect([], false, true);
    expect(f.requestDevice).toHaveBeenCalledOnce();
    expect(reloaded.getState().error).toContain('saved-device lookup');
    expect(reloaded.getState().errorDetail).toContain('Choose another bike');
  });
  it('keeps connection usable when browser storage is disabled', async () => {
    fixture(); vi.stubGlobal('localStorage', { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); } });
    const bike = new BluetoothBike(); await bike.connect(); expect(bike.getState().status).toBe('connected');
    expect(bike.getSavedBike()).toBeUndefined();
  });
});
function bikeNameInExport(bike: BluetoothBike) { return /PRIVATE NAME|PRIVATE ID/.test(bike.exportLog()); }
