import { afterEach, expect, it, vi } from 'vitest';
import { HitAudio } from './hit-audio';
afterEach(() => vi.unstubAllGlobals());
it('is silent by default and never creates an audio context without opting in', async () => {
  const AudioContext = vi.fn(); vi.stubGlobal('window', { AudioContext }); const audio = new HitAudio();
  expect(await audio.unlock()).toBe(false); audio.play('ring'); expect(AudioContext).not.toHaveBeenCalled();
});
it('keeps optional audio failure separate from scoring and flight', async () => {
  vi.stubGlobal('window', {}); const audio = new HitAudio(); audio.setEnabled(true);
  expect(await audio.unlock()).toBe(false); expect(() => audio.play('balloon')).not.toThrow(); audio.dispose();
});
it('unlocks from a gesture, plays distinct cues, mutes immediately and releases resources', async () => {
  const oscillators: { frequency: { value: number }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const gains: { gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> } }[] = [];
  const context = { state: 'running', currentTime: 1, destination: {}, resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    createGain: () => { const node = { gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(node); return node; },
    createOscillator: () => { const node = { type: '', frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }; oscillators.push(node); return node; } };
  vi.stubGlobal('window', { AudioContext: class { constructor() { return context; } } });
  const audio = new HitAudio(); audio.setEnabled(true); expect(await audio.unlock()).toBe(true);
  audio.play('ring'); expect(oscillators).toHaveLength(2); audio.play('balloon'); expect(oscillators).toHaveLength(5);
  audio.setEnabled(false); expect(gains[0].gain.value).toBe(0); audio.play('ring'); expect(oscillators).toHaveLength(5);
  audio.dispose(); expect(context.close).toHaveBeenCalledOnce();
});
