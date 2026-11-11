import { BaseAdapter } from './types';
import { CadenceTracker, hex, parseMeasurement, shortUUID, type Measurement, type ResistanceFormat } from './parsers';

export const SERVICES = [0x1826, 0x1818, 0x1816, 0x180d, 0x180f];
const KNOWN = new Set(['2ad2', '2a63', '2a5b', '2a37', '2a19']);
export interface DiagnosticEntry { elapsedMs: number; kind: string; service?: string; characteristic?: string; hex?: string; values?: Measurement; message?: string; browserDetail?: string; }
export interface CharacteristicInfo { key: string; service: string; uuid: string; read: boolean; notify: boolean; indicate: boolean; subscribed: boolean; standard: boolean; }
function errorFields(error: unknown) {
  // Native browser bridges may reject with strings or plain objects, not JS Errors.
  const object = error && typeof error === 'object' ? error as { name?: unknown; message?: unknown } : undefined;
  return { name: typeof object?.name === 'string' ? object.name : '', message: typeof error === 'string' ? error : typeof object?.message === 'string' ? object.message : '' };
}
export function localBluetoothErrorDetail(error: unknown): string {
  const { name, message } = errorFields(error);
  return ([name, message].filter(Boolean).join(': ') || 'Browser supplied no error details.').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 600);
}
export function bluetoothError(error: unknown): string {
  const { name } = errorFields(error);
  switch (name) {
    case 'NotFoundError': return 'Device selection cancelled, or the requested service is unavailable.';
    case 'SecurityError': case 'NotAllowedError': return 'Bluetooth permission denied or service access blocked. Check browser and iOS permissions, HTTPS, and requested service UUIDs.';
    case 'NetworkError': return 'Bluetooth connection lost or GATT operation failed. Wake the bike, close other bike apps, and reconnect.';
    case 'NotSupportedError': return 'This Bluetooth operation is unsupported by the browser or device.';
    case 'TypeError': return 'Bluetooth request rejected as an invalid or unsupported API call. Check the local browser detail and try the picker-only test.';
    case 'InvalidStateError': return 'Bluetooth is not ready, or this call is not allowed in the current browser state. Check Bluetooth access for Bluefy and retry from a fresh page.';
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
  async connect(extraServices: string[] = [], pickerOnly = false) {
    if (!window.isSecureContext) { this.fail('Bluetooth requires HTTPS (or localhost for desktop development).'); return; }
    if (!navigator.bluetooth || typeof navigator.bluetooth.requestDevice !== 'function') { this.fail('Web Bluetooth device selection is unavailable. On iPhone, open this HTTPS page in Bluefy; simulation remains available.'); return; }
    this.disconnect();
    const session = ++this.session;
    this.entries = []; this.started = Date.now();
    this.emit({ status: 'connecting', sample: { timestamp: 0 } });
    let stage = 'device selection (before GATT connection)';
    try {
      this.log({ kind: 'connection-stage', message: pickerOnly ? 'Requesting picker only; no optional services and no GATT connection.' : 'Requesting device picker with standard optional services as full UUID strings.' });
      // No awaits before requestDevice: invoked directly from the Connect click.
      // Full UUID strings avoid relying on short-number normalization in native bridges.
      const device = await navigator.bluetooth.requestDevice(pickerOnly ? { acceptAllDevices: true } : {
        acceptAllDevices: true,
        optionalServices: [...SERVICES.map(id => `0000${id.toString(16)}-0000-1000-8000-00805f9b34fb`), ...extraServices],
      });
      if (session !== this.session) return;
      if (pickerOnly) {
        const notice = 'Picker test succeeded: a device was selected. No GATT connection or data access was attempted. Use Connect Bluetooth bike for the full diagnostic connection.';
        this.emit({ status: 'disconnected', sample: { timestamp: 0 }, notice });
        this.log({ kind: 'picker-test', message: notice }); return;
      }
      stage = 'GATT connection (after device selection)';
      this.log({ kind: 'connection-stage', message: 'Device selected. Starting GATT connection.' });
      this.device = device;
      device.addEventListener('gattserverdisconnected', this.onDisconnect);
      if (!device.gatt) throw new DOMException('No GATT', 'NotSupportedError');
      const server = await device.gatt.connect();
      if (session !== this.session) { device.gatt.disconnect(); return; }
      this.emit({ status: 'connected', sample: { timestamp: 0 } });
      stage = 'service discovery';
      this.log({ kind: 'status', message: 'GATT connected. Device name and identifier intentionally omitted.' });
      this.log({ kind: 'parser-config', message: `FTMS resistance layout: ${this.resistanceFormat}. Verify against device documentation.` });
      const services = new Map<string, BluetoothRemoteGATTService>();
      try { for (const service of await server.getPrimaryServices()) services.set(service.uuid, service); }
      catch (e) { this.log({ kind: 'warning', message: `Service enumeration unavailable; probing explicitly requested services. ${bluetoothError(e)}`, browserDetail: localBluetoothErrorDetail(e) }); }
      for (const id of [...SERVICES, ...extraServices]) {
        if (session !== this.session) return;
        try { const service = await server.getPrimaryService(id); services.set(service.uuid, service); }
        catch (e) { this.log({ kind: 'unavailable', service: String(id), message: `Service discovery: ${bluetoothError(e)}`, browserDetail: localBluetoothErrorDetail(e) }); }
      }
      for (const service of services.values()) {
        stage = 'characteristic discovery';
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
        } catch (e) { this.log({ kind: 'error', service: service.uuid, message: `Characteristic discovery: ${bluetoothError(e)}`, browserDetail: localBluetoothErrorDetail(e) }); }
      }
      this.log({ kind: 'status', message: 'Discovery finished. Only authorized, accessible services are shown; this is not a complete device inventory.' });
    } catch (e) {
      if (session === this.session) { this.disconnect(); this.fail(`Failed at ${stage}. ${bluetoothError(e)}`, localBluetoothErrorDetail(e)); }
    }
  }
  private fail(message: string, browserDetail?: string) { this.emit({ status: 'error', sample: { timestamp: 0 }, error: message, errorDetail: browserDetail }); this.log({ kind: 'error', message, browserDetail }); }
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
    catch (e) { c.removeEventListener('characteristicvaluechanged', listener); this.handlers.delete(key); this.log({ kind: 'error', characteristic: c.uuid, message: `Notification subscription: ${bluetoothError(e)}`, browserDetail: localBluetoothErrorDetail(e) }); }
  }
  async readCharacteristic(key: string) {
    const c = this.active.get(key); if (!c) return;
    try { this.consume(key, await c.readValue()); }
    catch (e) { this.log({ kind: 'error', characteristic: c.uuid, message: `Characteristic read: ${bluetoothError(e)}`, browserDetail: localBluetoothErrorDetail(e) }); }
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
      return { ...e, hex: undefined, browserDetail: undefined, values: safe ? values : undefined, message: e.kind === 'parse-error' ? 'Malformed standard measurement' : e.message };
    });
    return JSON.stringify({ format: 'skycycle-diagnostics-v1', privacy: 'Relative timestamps. No device identifiers or raw payloads; vendor data and heart rate omitted.', entries }, null, 2);
  }
}
