import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createWorld, parseValleyStyle, terrainHeight, type Quality } from './world';
import { alpineHeight, sceneryRandom } from './enhanced-valley';

describe('enhanced valley', () => {
  it('defaults to enhanced scenery and respects an explicit classic preference', () => {
    expect(parseValleyStyle('enhanced')).toBe('enhanced');
    expect(parseValleyStyle('classic')).toBe('classic');
    for (const value of [null, 'unknown', 'space']) expect(parseValleyStyle(value)).toBe('enhanced');
    const world = createWorld('low'); expect(world.scene.getObjectByName('enhanced-valley')).toBeDefined(); world.dispose();
  });
  it('uses deterministic scenery and exactly the existing collision surface in the playable corridor', () => {
    const a = sceneryRandom(), b = sceneryRandom();
    expect(Array.from({ length: 100 }, a)).toEqual(Array.from({ length: 100 }, b));
    for (let x = -470; x <= 470; x += 47) for (let z = 300; z > -2600; z -= 100) expect(alpineHeight(x, z, terrainHeight)).toBe(terrainHeight(x, z));
    const worlds = [createWorld('low', 'valley', 'enhanced'), createWorld('low', 'valley', 'enhanced')];
    const signatures = worlds.map(w => {
      const result: number[][] = []; w.scene.traverse(o => { if (o instanceof THREE.InstancedMesh) result.push([...o.instanceMatrix.array]); }); return result;
    });
    expect(signatures[0]).toEqual(signatures[1]); worlds.forEach(w => w.dispose());
  });
  it.each<Quality>(['low', 'medium', 'high'])('preserves targets and bounds animation and resources at %s quality', quality => {
    const classic = createWorld(quality, 'valley', 'classic'), world = createWorld(quality, 'valley', 'enhanced');
    expect(world.targets).toEqual(classic.targets); expect(world.bike.position).toEqual(classic.bike.position);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), instances: THREE.InstancedMesh[] = [];
    let objects = 0;
    world.scene.traverse(o => {
      objects++;
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); }
      if (o instanceof THREE.InstancedMesh) instances.push(o);
    });
    const spies = [...geometries, ...materials, ...instances].map(resource => vi.spyOn(resource, 'dispose'));
    const river = world.scene.getObjectByName('flowing-river') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    world.bike.position.z = -2200; world.update(10, 1, .016);
    expect(river.material.uniforms.time.value).toBe(10);
    expect(world.scene.getObjectByName('valley-chunk-0')!.visible).toBe(false);
    world.bike.position.z = 110; world.update(20, 1, .016);
    expect(world.scene.getObjectByName('valley-chunk-0')!.visible).toBe(true);
    let after = 0; world.scene.traverse(() => after++); expect(after).toBe(objects);
    world.celebrate(0); world.targets[0].hit = true; world.update(21, 1, .016); expect(world.targetObjects[0].visible).toBe(false);
    world.resetTargets(); expect(world.targetObjects[0].visible).toBe(true);
    world.dispose(); spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); expect(world.scene.children).toHaveLength(0);
    const rebuilt = createWorld(quality, 'valley', 'enhanced');
    expect((rebuilt.scene.getObjectByName('alpine-terrain') as THREE.Mesh).geometry).not.toBe((classic.scene.children.find(o => o instanceof THREE.Mesh) as THREE.Mesh).geometry);
    rebuilt.dispose(); classic.dispose();
  });
});
