import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PostProcessing } from 'three/webgpu';
import { graphicsDisposer } from './graphics-lifecycle';
vi.mock('three/webgpu', async importOriginal => {
  const original = await importOriginal<typeof import('three/webgpu')>();
  return { ...original,
    WebGPURenderer: class {
      backend = { isWebGPUBackend: true }; info = { autoReset: true, reset() {} };
      async init() {} setPixelRatio() {} async compileAsync() {} dispose() {}
    },
    PostProcessing: class { render() {} dispose() {} }
  };
});
import { createCinematic, CINEMATIC_LIGHTING } from './cinematic';
import { createWorld } from './world';
import { initialFlow } from './kaleidoscope';
it('adapts every tunnel GLSL material, keeps scene effects bounded and releases replacements and targets', async () => {
  vi.stubGlobal('navigator', { gpu: {} }); vi.stubGlobal('window', { devicePixelRatio: 2 });
  try {
    for (const quality of ['low', 'medium', 'high'] as const) {
      const world = createWorld(quality, 'kaleidoscope');
      const original = (world.scene.getObjectByName('kaleidoscope-liquid-glass') as THREE.Mesh).material as THREE.Material;
      const dispose = vi.spyOn(original, 'dispose');
      const graphics = await createCinematic(quality), camera = new THREE.PerspectiveCamera();
      world.bike.position.set(0, 45, 110);
      world.updateTunnel!(0, initialFlow(), false);
      await graphics.prepare(world.scene, camera);
      for (const name of ['kaleidoscope-rings', 'kaleidoscope-frames', 'kaleidoscope-lanterns']) {
        const mesh = world.scene.getObjectByName(name) as THREE.InstancedMesh;
        expect(mesh.instanceColor).not.toBeNull();
        const tint = new THREE.Color(); mesh.getColorAt(0, tint);
        expect(Math.max(tint.r, tint.g, tint.b) - Math.min(tint.r, tint.g, tint.b)).toBeGreaterThan(.01);
      }
      let shaders = 0;
      world.scene.traverse(object => { if (object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial) shaders++; });
      expect(shaders).toBe(0); expect(graphics.label).toContain('WebGPU');
      const poolSize = world.scene.children.length;
      for (let i = 0; i < 100; i++) { camera.position.z -= 500; graphics.render(world.scene, camera, i, i % 2 === 0, 1 / 60); }
      expect(world.scene.children.length).toBe(poolSize);
      const veils = world.scene.getObjectByName('cinematic-light-veils') as THREE.InstancedMesh;
      expect(veils.count).toBe(8);
      const failure = vi.fn(); graphics.onFailure?.(failure);
      (graphics.renderer as unknown as { onDeviceLost(): void }).onDeviceLost(); expect(failure).toHaveBeenCalledOnce();
      graphics.dispose(); graphics.dispose(); expect(dispose).toHaveBeenCalledOnce();
      world.dispose();
    }
  } finally { vi.unstubAllGlobals(); }
});

it('rejects uninitialised white batches before WebGPU shader compilation', async () => {
  vi.stubGlobal('navigator', { gpu: {} }); vi.stubGlobal('window', { devicePixelRatio: 2 });
  const world = createWorld('low', 'kaleidoscope'), graphics = await createCinematic('low');
  try {
    const compile = vi.spyOn(graphics.renderer, 'compileAsync');
    await expect(graphics.prepare(world.scene, new THREE.PerspectiveCamera())).rejects.toThrow('Initialise tunnel colours');
    expect(compile).not.toHaveBeenCalled();
    expect(CINEMATIC_LIGHTING.maxHalo).toBeLessThanOrEqual(.012);
    expect(CINEMATIC_LIGHTING.bloomStrength).toBeLessThan(.15);
  } finally { graphics.dispose(); world.dispose(); vi.unstubAllGlobals(); }
});

it('still releases the renderer when a postprocessing cleanup throws during a world switch', async () => {
  vi.stubGlobal('navigator', { gpu: {} }); vi.stubGlobal('window', { devicePixelRatio: 2 });
  const world = createWorld('low', 'kaleidoscope'), graphics = await createCinematic('low');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    world.bike.position.set(0, 45, 110); world.updateTunnel!(0, initialFlow(), false);
    await graphics.prepare(world.scene, new THREE.PerspectiveCamera());
    const rendererDispose = vi.spyOn(graphics.renderer, 'dispose');
    const postDispose = vi.spyOn(PostProcessing.prototype, 'dispose').mockImplementation(() => { throw new Error('post target release'); });
    const release = graphicsDisposer(world, graphics);
    expect(release).not.toThrow(); release(); expect(rendererDispose).toHaveBeenCalledOnce();
    expect(world.scene.children).toHaveLength(0); postDispose.mockRestore();
  } finally { warn.mockRestore(); vi.unstubAllGlobals(); }
});
