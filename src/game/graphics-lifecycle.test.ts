import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { graphicsDisposer } from './graphics-lifecycle';
import { createWorld } from './world';
import { initialFlow } from './kaleidoscope';

it('releases material listeners while their renderer state is still alive, then destroys the renderer', () => {
  let rendererAlive = true;
  const material = new THREE.MeshBasicMaterial(), order: string[] = [];
  material.addEventListener('dispose', () => {
    if (!rendererAlive) throw new Error('nodeBuilderState is unavailable after renderer disposal');
    order.push('material');
  });
  const release = graphicsDisposer({ dispose() { material.dispose(); } }, { dispose() { rendererAlive = false; order.push('renderer'); } });
  release(); release();
  expect(order).toEqual(['material', 'renderer']);
});
it('continues cleanup without crashing the UI if one release throws', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}), renderer = vi.fn();
  try {
    const release = graphicsDisposer({ dispose() { throw new Error('failed scene listener'); } }, { dispose: renderer });
    expect(release).not.toThrow(); release(); expect(renderer).toHaveBeenCalledOnce(); expect(warn).toHaveBeenCalledOnce();
  } finally { warn.mockRestore(); }
});
it('handles repeated transitions between all worlds and late cancelled initialisation releases', async () => {
  for (const environment of ['road', 'kaleidoscope', 'valley', 'space', 'road', 'kaleidoscope'] as const) {
    const world = createWorld('low', environment, 'enhanced', environment === 'road');
    world.bike.position.set(0, 45, 110); world.updateTunnel?.(0, initialFlow(), false);
    let alive = true, releases = 0;
    world.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.addEventListener('dispose', () => { expect(alive).toBe(true); });
      }
    });
    const release = graphicsDisposer(world, { dispose() { alive = false; releases++; } });
    // A pending compile can finish after its effect has already been cancelled.
    await Promise.resolve(); release(); release();
    expect(releases).toBe(1); expect(world.scene.children).toHaveLength(0);
  }
});

it('reproduces the Three.js node-cache failure without a GPU and prevents it with scene-first disposal', async () => {
  const { default: Nodes } = await import('three/src/renderers/common/nodes/Nodes.js');
  const makeSession = () => {
    const nodes = new Nodes(null as never, null as never);
    const object = { isRenderObject: true } as never;
    // Two references avoid unrelated cache-key construction on this minimal render object.
    (nodes.get(object) as { nodeBuilderState: { usedTimes: number } }).nodeBuilderState = { usedTimes: 2 };
    const material = new THREE.MeshBasicMaterial();
    material.addEventListener('dispose', () => { nodes.delete(object); });
    return { nodes, material };
  };
  const broken = makeSession(); broken.nodes.dispose();
  expect(() => broken.material.dispose()).toThrow();
  const fixed = makeSession(); let materialReleased = false;
  fixed.material.addEventListener('dispose', () => { materialReleased = true; });
  const release = graphicsDisposer({ dispose() { fixed.material.dispose(); } }, { dispose() { fixed.nodes.dispose(); } });
  expect(release).not.toThrow(); expect(materialReleased).toBe(true);
});
