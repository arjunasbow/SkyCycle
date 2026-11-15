import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
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
import { createCinematic } from './cinematic';
import { createWorld } from './world';
it('adapts every tunnel GLSL material, keeps scene effects bounded and releases replacements and targets', async () => {
  vi.stubGlobal('navigator', { gpu: {} }); vi.stubGlobal('window', { devicePixelRatio: 2 });
  try {
    for (const quality of ['low', 'medium', 'high'] as const) {
      const world = createWorld(quality, 'kaleidoscope');
      const original = (world.scene.getObjectByName('kaleidoscope-liquid-glass') as THREE.Mesh).material as THREE.Material;
      const dispose = vi.spyOn(original, 'dispose');
      const graphics = await createCinematic(quality), camera = new THREE.PerspectiveCamera();
      await graphics.prepare(world.scene, camera);
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
