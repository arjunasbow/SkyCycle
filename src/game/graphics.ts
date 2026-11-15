import * as THREE from 'three';
import { graphicsPixelCap, type GraphicsMode } from './graphics-settings';
import type { Quality, Environment } from './world';
export interface Graphics {
  renderer: THREE.WebGLRenderer | import('three/webgpu').WebGPURenderer;
  label: string;
  notice: string;
  prepare(scene: THREE.Scene, camera: THREE.Camera): Promise<void>;
  render(scene: THREE.Scene, camera: THREE.Camera, elapsed: number, reduced: boolean, dt: number): void;
  onFailure?(handler: () => void): void;
  dispose(): void;
}
export async function createGraphics(mode: GraphicsMode, quality: Quality, environment: Environment = 'kaleidoscope'): Promise<Graphics> {
  let notice = '';
  if (mode === 'cinematic') {
    try {
      const { createCinematic } = await import('./cinematic');
      return await createCinematic(quality, environment);
    } catch {
      notice = 'WebGPU could not start in this browser. Standard graphics is active; you can try Cinematic again in Flight settings.';
    }
  }
  const renderer = new THREE.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, graphicsPixelCap(quality)));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  return { renderer, label: 'WebGL', notice,
    async prepare(scene, camera) { renderer.compile(scene, camera); },
    render(scene, camera) { renderer.render(scene, camera); },
    dispose() { renderer.dispose(); }
  };
}
