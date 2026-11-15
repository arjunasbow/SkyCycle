import { expect, it } from 'vitest';
import { AdaptiveResolution, parseGraphicsMode } from './graphics-settings';
it('requires an explicit opt-in to cinematic graphics', () => {
  for (const value of [null, '', 'webgpu', 'unknown']) expect(parseGraphicsMode(value)).toBe('standard');
  expect(parseGraphicsMode('cinematic')).toBe('cinematic');
});
it('reduces rendering resolution under sustained load without reacting to single frame gaps', () => {
  const adaptive = new AdaptiveResolution(1.5);
  for (const dt of [0, -1, NaN, 2, Infinity]) expect(adaptive.sample(dt)).toBe(false);
  expect(adaptive.ratio).toBe(1.5);
  for (let i = 0; i < 100; i++) adaptive.sample(1 / 30);
  expect(adaptive.ratio).toBeCloseTo(1.35);
  for (let i = 0; i < 3000; i++) adaptive.sample(1 / 20);
  expect(adaptive.ratio).toBe(.65);
  for (let i = 0; i < 60 * 7; i++) adaptive.sample(1 / 60);
  expect(adaptive.ratio).toBe(.65);
  for (let i = 0; i < 60 * 130; i++) adaptive.sample(1 / 60);
  expect(adaptive.ratio).toBeLessThanOrEqual(1.5); expect(adaptive.ratio).toBeGreaterThan(.65);
});

it('never increases a low device pixel ratio while reducing load', () => {
  const adaptive = new AdaptiveResolution(.5);
  for (let i = 0; i < 200; i++) adaptive.sample(1 / 25);
  expect(adaptive.ratio).toBe(.5);
});
