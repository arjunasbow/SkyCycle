import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createWorld } from './world';
it('makes side balloons collectible and reuses one bounded hit-effect pool', () => {
  const world = createWorld('low');
  expect(world.targets).toHaveLength(26); expect(world.targetObjects).toHaveLength(26);
  expect(world.targets.filter(t => t.bonus && t.kind === 'balloon')).toHaveLength(6);
  world.celebrate(0); world.targets[0].hit = true; world.update(0, 1, .1);
  const pools: THREE.Points[] = []; world.scene.traverse(o => { if (o instanceof THREE.Points) pools.push(o); });
  expect(pools).toHaveLength(1); expect(pools[0].geometry.getAttribute('position').count).toBe(24);
  expect(world.targetObjects[0].visible).toBe(false); expect(pools[0].visible).toBe(true);
  world.update(1, 1, .9); expect(pools[0].visible).toBe(false);
  world.resetTargets(); expect(world.targetObjects[0].visible).toBe(true); world.dispose();
});
