import type { Quality } from './world';
export type GraphicsMode = 'standard' | 'cinematic';
export const parseGraphicsMode = (value: string | null): GraphicsMode => value === 'cinematic' ? 'cinematic' : 'standard';
export const graphicsPixelCap = (quality: Quality) => quality === 'low' ? 1 : quality === 'medium' ? 1.25 : 1.5;
/** Adjust only the scene resolution, in slow bounded steps; riding physics never changes. */
export class AdaptiveResolution {
  ratio: number;
  private duration = 0;
  private frames = 0;
  private fastWindows = 0;
  constructor(readonly maximum: number) { this.ratio = maximum; }
  sample(dt: number): boolean {
    if (!Number.isFinite(dt) || dt <= 0 || dt > .15) return false;
    this.duration += dt; this.frames++;
    if (this.duration < 3) return false;
    const fps = this.frames / this.duration, before = this.ratio;
    if (fps < 50) { this.ratio = Math.max(Math.min(.65, this.maximum), this.ratio * .9); this.fastWindows = 0; }
    else if (fps >= 58) { if (++this.fastWindows >= 3) { this.ratio = Math.min(this.maximum, this.ratio * 1.05); this.fastWindows = 0; } }
    else this.fastWindows = 0;
    this.duration = 0; this.frames = 0;
    return Math.abs(before - this.ratio) > .001;
  }
}
