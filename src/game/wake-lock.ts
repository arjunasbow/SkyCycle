export interface AwakeState { kind: 'off' | 'requesting' | 'active' | 'unavailable' | 'released'; message: string; }

export function awakeStatusLabel(enabled: boolean, status: 'ready' | 'running' | 'paused' | 'finished', state: AwakeState): string {
  if (!enabled) return 'AWAKE OFF';
  if (status !== 'running') return status === 'paused' ? 'AWAKE PAUSED' : 'AWAKE READY';
  if (state.kind === 'active') return 'AWAKE ON';
  if (state.kind === 'off' || state.kind === 'requesting') return 'WAKE REQUEST';
  return 'SLEEP POSSIBLE';
}
type BluefyScreenControl = { setScreenDimEnabled?: (enabled: boolean) => void | Promise<void> };
/** Display lifecycle only. Does not select, connect to, read or write a BLE peripheral. */
export class ScreenAwakeController {
  private generation = 0;
  private lock?: WakeLockSentinel;
  private bluefy?: BluefyScreenControl;
  constructor(private notify: (state: AwakeState) => void) {}
  async start() {
    if (this.lock || this.bluefy) return;
    const generation = ++this.generation;
    if (document.visibilityState === 'hidden') { this.notify({ kind: 'off', message: 'Keep-awake waits until the ride is visible.' }); return; }
    this.notify({ kind: 'requesting', message: 'Requesting screen keep-awake for this ride.' });
    if (typeof navigator.wakeLock?.request === 'function') {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (generation !== this.generation) { await lock.release(); return; }
        this.lock = lock;
        lock.addEventListener('release', () => {
          if (this.lock === lock) { this.lock = undefined; this.notify({ kind: 'released', message: 'The system released screen keep-awake. Pause/resume to retry, or adjust Bluefy/iPhone auto-lock for this ride.' }); }
        }, { once: true });
        this.notify({ kind: 'active', message: 'Screen wake lock acquired. The system can still release it.' }); return;
      } catch { /* Try Bluefy's documented display API if the standard API fails. */ }
    }
    if (generation !== this.generation) return;
    const bluefy = navigator.bluetooth as unknown as BluefyScreenControl | undefined;
    if (typeof bluefy?.setScreenDimEnabled === 'function') {
      try {
        this.bluefy = bluefy;
        await bluefy.setScreenDimEnabled(false);
        // stop() already restored dimming. Do not override a newer ride's request.
        if (generation !== this.generation) return;
        this.notify({ kind: 'active', message: 'Keep-awake requested through Bluefy screen-dimming control; confirm on your iPhone.' }); return;
      } catch { this.bluefy = undefined; }
    }
    if (generation === this.generation) this.notify({ kind: 'unavailable', message: 'Keep-awake unavailable or denied. For this ride, adjust Bluefy screen dimming or iPhone Auto-Lock manually.' });
  }
  stop() {
    ++this.generation;
    const lock = this.lock; this.lock = undefined;
    if (lock) void lock.release().catch(() => {});
    const bluefy = this.bluefy; this.bluefy = undefined;
    if (bluefy?.setScreenDimEnabled) { try { void Promise.resolve(bluefy.setScreenDimEnabled(true)).catch(() => {}); } catch { /* Best-effort restoration. */ } }
    this.notify({ kind: 'off', message: 'Keep-awake is off while the ride is paused, finished or disabled.' });
  }
}
