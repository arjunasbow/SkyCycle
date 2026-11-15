import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
const state = vi.hoisted(() => ({ failGPU: false, disposed: 0, constructed: 0, compiled: 0 }));
vi.mock('./cinematic', () => ({ createCinematic: async () => { if (state.failGPU) throw new Error('No adapter'); return { label: 'WebGPU · CINEMATIC' }; } }));
vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>();
  return { ...original, WebGLRenderer: class {
    constructor() { state.constructed++; }
    setPixelRatio() {} compile() { state.compiled++; } render() {} dispose() { state.disposed++; }
  } };
});
import { createGraphics } from './graphics';
afterEach(() => { vi.unstubAllGlobals(); state.failGPU = false; });
it('uses the requested WebGPU path and falls back honestly when adapter initialisation fails', async () => {
  vi.stubGlobal('window', { devicePixelRatio: 2 });
  const before = state.constructed;
  expect((await createGraphics('cinematic', 'high')).label).toBe('WebGPU · CINEMATIC');
  expect(state.constructed).toBe(before);
  state.failGPU = true;
  const fallback = await createGraphics('cinematic', 'high');
  expect(fallback.label).toBe('WebGL'); expect(fallback.notice).toContain('could not start');
  await fallback.prepare(new THREE.Scene(), new THREE.Camera()); expect(state.compiled).toBeGreaterThan(0);
  const disposed = state.disposed; fallback.dispose(); expect(state.disposed).toBe(disposed + 1);
});
