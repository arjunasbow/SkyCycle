import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createWorld } from './world';

describe('space bike', () => {
  it('uses rear thrusters only in space and keeps the valley rotor', () => {
    for (const style of ['classic', 'enhanced'] as const) {
      const valley = createWorld('low', 'valley', style);
      expect(valley.bike.getObjectByName('rocket-thrusters')).toBeUndefined();
      expect(valley.propeller.visible).toBe(true);
      expect(valley.propeller.children.length).toBeGreaterThan(0);
      valley.dispose();
    }
    const space = createWorld('high', 'space');
    expect(space.propeller.visible).toBe(false);
    expect(space.propeller.children).toHaveLength(0);
    const thrusters = space.bike.getObjectByName('rocket-thrusters')!;
    const exhausts = [-1, 1].map(side => thrusters.getObjectByName(`rocket-exhaust-${side}`)!);
    expect(exhausts[0].position.x).toBe(-exhausts[1].position.x);
    exhausts.forEach(exhaust => expect(exhaust.position.z).toBeGreaterThan(.95));
    let count = 0; space.scene.traverse(() => count++);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    thrusters.traverse(o => {
      if (o instanceof THREE.Mesh) {
        resources.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => resources.add(m));
      }
    });
    const disposals = [...resources].map(resource => vi.spyOn(resource, 'dispose'));
    space.update(1, 0, .016); const idle = exhausts[0].scale.z;
    space.update(2, 1, .016); expect(exhausts[0].scale.z).toBeGreaterThan(idle);
    expect(space.propeller.rotation.z).toBe(0);
    for (let i = 0; i < 100; i++) space.update(i, 2, .016);
    let after = 0; space.scene.traverse(() => after++); expect(after).toBe(count);
    space.update(101, 0, .016); expect(exhausts[0].scale.z).toBe(idle);
    space.dispose(); disposals.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });
});
