import { expect, it, vi } from 'vitest';
import { enterFlightFullscreen } from './display';
it('falls back to page expansion when native fullscreen is missing or denied', async () => {
  expect(await enterFlightFullscreen({} as HTMLElement)).toBe(false);
  expect(await enterFlightFullscreen({ requestFullscreen: vi.fn().mockRejectedValue(new Error('unsupported')) } as unknown as HTMLElement)).toBe(false);
});
it('requests native fullscreen directly when available', async () => {
  const requestFullscreen = vi.fn().mockResolvedValue(undefined);
  const pending = enterFlightFullscreen({ requestFullscreen } as unknown as HTMLElement);
  expect(requestFullscreen).toHaveBeenCalledOnce(); expect(await pending).toBe(true);
});
