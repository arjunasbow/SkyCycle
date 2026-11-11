import { afterEach, describe, expect, it, vi } from 'vitest';
import { BluetoothBike } from './bluetooth';
function fixture() {
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
    expect(f.requestDevice).toHaveBeenCalledWith(expect.objectContaining({ acceptAllDevices: true, optionalServices: expect.arrayContaining([0x1826, 0x1818, 0x1816]) }));
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
});
