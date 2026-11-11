import { BaseAdapter } from './types';
import { CadenceTracker, hex, parseMeasurement, shortUUID, type Measurement, type ResistanceFormat } from './parsers';

export const SERVICES = [0x1826, 0x1818, 0x1816, 0x180d, 0x180f];
const KNOWN = new Set(['2ad2', '2a63', '2a5b', '2a37', '2a19']);
export interface DiagnosticEntry { elapsedMs: number; kind: string; service?: string; characteristic?: string; hex?: string; values?: Measurement; message?: string; }
export interface CharacteristicInfo { key: string; service: string; uuid: string; read: boolean; notify: boolean; indicate: boolean; subscribed: boolean; standard: boolean; }
export function bluetoothError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotFoundError': return 'Device selection cancelled, or the requested service is unavailable.';
    case 'SecurityError': case 'NotAllowedError': return 'Bluetooth permission denied or service access blocked. Check browser and iOS permissions, HTTPS, and requested service UUIDs.';
    case 'NetworkError': return 'Bluetooth connection lost or GATT operation failed. Wake the bike, close other bike apps, and reconnect.';
    case 'NotSupportedError': return 'This Bluetooth operation is unsupported by the browser or device.';
    default: return 'Bluetooth operation failed. Confirm browser support, permissions, and bike availability.';
  }
}
export class BluetoothBike extends BaseAdapter {
  resistanceFormat: ResistanceFormat = 'gss2026';
  entries: DiagnosticEntry[] = [];
  characteristics: CharacteristicInfo[] = [];
  private started = Date.now();
  private device?: BluetoothDevice;
  private session = 0;
  private active = new Map<string, BluetoothRemoteGATTCharacteristic>();
  private handlers = new Map<string, EventListener>();
  private trackers = new Map<string, CadenceTracker>();
  onDiagnostics?: () => void;
  private log(entry: Omit<DiagnosticEntry, 'elapsedMs'>) {
    this.entries.push({ elapsedMs: Date.now() - this.started, ...entry });
    if (this.entries.length > 800) this.entries.shift();
    this.onDiagnostics?.();
  }
  async connect(extraServices: string[] = []) {
    if (!window.isSecureContext) { this.fail('Bluetooth requires HTTPS (or localhost for desktop development).'); return; }
    if (!navigator.bluetooth) { this.fail('Web Bluetooth is unavailable. On iPhone, open this HTTPS page in Bluefy; simulation remains available.'); return; }
    this.disconnect();
    const session = ++this.session;
    this.entries = []; this.started = Date.now();
    this.emit({ status: 'connecting', sample: { timestamp: 0 } });
    try {
      // No awaits before requestDevice: invoked directly from the Connect click.
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [...SERVICES, ...extraServices] });
      if (session !== this.session) return;
      this.device = device;
      device.addEventListener('gattserverdisconnected', this.onDisconnect);
      if (!device.gatt) throw new DOMException('No GATT', 'NotSupportedError');
      const server = await device.gatt.connect();
      if (session !== this.session) { device.gatt.disconnect(); return; }
      this.emit({ status: 'connected', sample: { timestamp: 0 } });
      this.log({ kind: 'status', message: 'GATT connected. Device name and identifier intentionally omitted.' });
      this.log({ kind: 'parser-config', message: `FTMS resistance layout: ${this.resistanceFormat}. Verify against device documentation.` });
      const services = new Map<string, BluetoothRemoteGATTService>();
      try { for (const service of await server.getPrimaryServices()) services.set(service.uuid, service); }
      catch { this.log({ kind: 'warning', message: 'Service enumeration unavailable; probing explicitly requested services.' }); }
      for (const id of [...SERVICES, ...extraServices]) {
        if (session !== this.session) return;
        try { const service = await server.getPrimaryService(id); services.set(service.uuid, service); }
        catch (e) { this.log({ kind: 'unavailable', service: String(id), message: bluetoothError(e) }); }
      }
      for (const service of services.values()) {
        if (session !== this.session) return;
        try {
          for (const c of await service.getCharacteristics()) {
            if (session !== this.session) return;
            const key = `${service.uuid}/${c.uuid}`, p = c.properties;
            this.active.set(key, c);
            this.characteristics.push({ key, service: service.uuid, uuid: c.uuid, read: p.read, notify: p.notify, indicate: p.indicate, subscribed: false, standard: KNOWN.has(shortUUID(c.uuid)) });
            this.log({ kind: 'characteristic', service: service.uuid, characteristic: c.uuid, message: `read=${p.read}, notify=${p.notify}, indicate=${p.indicate}; write operations disabled` });
            if (KNOWN.has(shortUUID(c.uuid))) {
              if (p.notify || p.indicate) await this.subscribeCharacteristic(key);
              else if (p.read) await this.readCharacteristic(key);
            }
          }
        } catch (e) { this.log({ kind: 'error', service: service.uuid, message: bluetoothError(e) }); }
      }
      this.log({ kind: 'status', message: 'Discovery finished. Only authorized, accessible services are shown; this is not a complete device inventory.' });
    } catch (e) {
      if (session === this.session) { this.disconnect(); this.fail(bluetoothError(e)); }
    }
  }
  private fail(message: string) { this.emit({ status: 'error', sample: { timestamp: 0 }, error: message }); this.log({ kind: 'error', message }); }
  private consume(key: string, view: DataView) {
    const c = this.active.get(key); if (!c) return;
    let values: Measurement | undefined;
    try {
      values = parseMeasurement(c.uuid, view, this.resistanceFormat);
      if (values) {
        let tracker = this.trackers.get(key);
        if (!tracker) { tracker = new CadenceTracker(); this.trackers.set(key, tracker); }
        const cadence = tracker.update(values, Date.now());
        if (cadence !== undefined) values.cadence = cadence;
        const now = Date.now(), sample = { ...this.state.sample, timestamp: now };
        if (values.cadence !== undefined) { sample.cadence = values.cadence; sample.cadenceAt = now; }
        if (values.watts !== undefined) { sample.watts = values.watts; sample.wattsAt = now; }
        if (values.speedKph !== undefined) sample.speedKph = values.speedKph;
        this.emit({ status: 'connected', sample });
      }
      this.log({ kind: 'measurement', service: c.service.uuid, characteristic: c.uuid, hex: hex(view), values, message: values ? undefined : 'Unknown format: raw bytes only. No protocol assumptions.' });
    } catch (e) { this.log({ kind: 'parse-error', characteristic: c.uuid, hex: hex(view), message: e instanceof Error ? e.message : 'Invalid standard measurement' }); }
  }
  async subscribeCharacteristic(key: string) {
    const c = this.active.get(key), info = this.characteristics.find(i => i.key === key);
    if (!c || !info || info.subscribed) return;
    // Unknown characteristics are opt-in in the UI. No control-point writes, ever.
    const listener: EventListener = () => { if (c.value) this.consume(key, c.value); };
    c.addEventListener('characteristicvaluechanged', listener); this.handlers.set(key, listener);
    try { await c.startNotifications(); info.subscribed = true; this.onDiagnostics?.(); }
    catch (e) { c.removeEventListener('characteristicvaluechanged', listener); this.handlers.delete(key); this.log({ kind: 'error', characteristic: c.uuid, message: bluetoothError(e) }); }
  }
  async readCharacteristic(key: string) {
    const c = this.active.get(key); if (!c) return;
    try { this.consume(key, await c.readValue()); }
    catch (e) { this.log({ kind: 'error', characteristic: c.uuid, message: bluetoothError(e) }); }
  }
  private cleanup() {
    this.active.forEach((c, key) => { const fn = this.handlers.get(key); if (fn) c.removeEventListener('characteristicvaluechanged', fn); });
    this.active.clear(); this.handlers.clear(); this.trackers.clear(); this.characteristics = [];
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnect); this.device = undefined;
  }
  private onDisconnect = () => {
    ++this.session; this.cleanup();
    this.emit({ status: 'disconnected', sample: { timestamp: Date.now(), cadence: 0, watts: 0 }, error: 'Bike disconnected. Thrust will decay; reconnect or select simulation.' });
    this.log({ kind: 'disconnect', message: 'GATT disconnected; bike data reset.' });
  };
  disconnect() {
    ++this.session;
    const device = this.device; this.cleanup(); device?.gatt?.disconnect();
    this.emit({ status: 'disconnected', sample: { timestamp: Date.now(), cadence: 0, watts: 0 } });
  }
  clearLog() { this.entries = []; this.started = Date.now(); this.onDiagnostics?.(); }
  /** No names, IDs, arbitrary raw vendor payloads, HR or battery data in exports. */
  exportLog() {
    const entries = this.entries.map(e => {
      const safe = ['2ad2', '2a63', '2a5b'].includes(shortUUID(e.characteristic ?? ''));
      const values = e.values ? Object.fromEntries(Object.entries(e.values).filter(([k]) => !k.toLowerCase().includes('heartrate'))) : undefined;
      return { ...e, hex: undefined, values: safe ? values : undefined, message: e.kind === 'parse-error' ? 'Malformed standard measurement' : e.message };
    });
    return JSON.stringify({ format: 'skycycle-diagnostics-v1', privacy: 'Relative timestamps. No device identifiers or raw payloads; vendor data and heart rate omitted.', entries }, null, 2);
  }
}
