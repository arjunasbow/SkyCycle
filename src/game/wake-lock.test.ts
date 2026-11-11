import { afterEach, expect, it, vi } from 'vitest';
import { ScreenAwakeController } from './wake-lock';
afterEach(() => vi.unstubAllGlobals());
function setup(navigator: object) { vi.stubGlobal('navigator', navigator); vi.stubGlobal('document', { visibilityState: 'visible' }); const notify = vi.fn(); return { controller: new ScreenAwakeController(notify), notify }; }
function sentinel() { return Object.assign(new EventTarget(), { release: vi.fn().mockResolvedValue(undefined) }); }
it('acquires standard wake lock and releases it on pause/cleanup', async () => {
  const lock = sentinel(), request = vi.fn().mockResolvedValue(lock), { controller, notify } = setup({ wakeLock: { request } });
  await controller.start(); expect(request).toHaveBeenCalledWith('screen'); expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'active' }));
  controller.stop(); expect(lock.release).toHaveBeenCalledOnce();
});
it('releases a late acquisition after the ride has already stopped', async () => {
  const lock = sentinel(); let resolve!: (value: unknown) => void;
  const { controller, notify } = setup({ wakeLock: { request: () => new Promise(r => { resolve = r; }) } });
  const pending = controller.start(); controller.stop(); resolve(lock); await pending;
  expect(lock.release).toHaveBeenCalledOnce(); expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'off' }));
});
it('reports system release instead of claiming the screen will remain awake', async () => {
  const lock = sentinel(), { controller, notify } = setup({ wakeLock: { request: async () => lock } });
  await controller.start(); lock.dispatchEvent(new Event('release'));
  expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'released' }));
});
it('falls back to Bluefy dimming control and restores normal dimming on stop', async () => {
  const setScreenDimEnabled = vi.fn(), { controller, notify } = setup({ wakeLock: { request: vi.fn().mockRejectedValue(new Error('denied')) }, bluetooth: { setScreenDimEnabled } });
  await controller.start(); expect(setScreenDimEnabled).toHaveBeenCalledWith(false); expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'active' }));
  controller.stop(); expect(setScreenDimEnabled).toHaveBeenLastCalledWith(true);
});
it('degrades gracefully when no keep-awake method exists and does nothing while hidden', async () => {
  const { controller, notify } = setup({}); await controller.start(); expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'unavailable' }));
  vi.stubGlobal('document', { visibilityState: 'hidden' }); await controller.start(); expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'off' }));
});
it('does not let a late Bluefy response re-enable dimming over a resumed ride', async () => {
  let resolveFirst!: () => void;
  const setScreenDimEnabled = vi.fn().mockImplementationOnce(() => new Promise<void>(r => { resolveFirst = r; }));
  const { controller: first } = setup({ bluetooth: { setScreenDimEnabled } });
  const pending = first.start(); first.stop();
  const next = new ScreenAwakeController(vi.fn()); await next.start(); resolveFirst(); await pending;
  expect(setScreenDimEnabled.mock.calls.map(call => call[0])).toEqual([false, true, false]); next.stop();
});
