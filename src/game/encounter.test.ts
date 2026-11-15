import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createWorld } from './world';
import { MANDALA_DISTANCE, mandalaGapAt, LOTUS_DISTANCE, lotusGapAt, lotusDistanceAt } from './mandala-encounter';
import { JOURNEY_LENGTH, initialFlow, routeX, routeY } from './kaleidoscope';
import { cyclingCadence } from './tunnel-rider';
import type { BikeState } from '../bike/types';
it('opens the tunnel about fifteen seconds before the mandala and restores it after passage on every lap', () => {
  for (const lap of [0, 1, 10]) {
    const centre = MANDALA_DISTANCE + lap * JOURNEY_LENGTH;
    expect(mandalaGapAt(centre - 400)).toBe(0);
    expect(mandalaGapAt(centre - 300)).toBe(1);
    expect(mandalaGapAt(centre)).toBe(1);
    expect(mandalaGapAt(centre + 190)).toBe(0);
    const world = createWorld('low', 'kaleidoscope'), flow = initialFlow();
    world.bike.position.set(routeX(centre), routeY(centre) - 3.2, 110 - centre); world.updateTunnel!(60, flow, false);
    const mandala = world.scene.getObjectByName('kaleidoscope-mandala')!;
    expect(mandala.position.x).toBeCloseTo(routeX(centre)); expect(mandala.position.y).toBeCloseTo(routeY(centre));
    const rings = world.scene.getObjectByName('kaleidoscope-rings') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); rings.getMatrixAt(12, matrix);
    expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBeLessThan(.01);
    const galaxy = world.scene.getObjectByName('kaleidoscope-side-galaxy')!;
    expect(galaxy.position.x - mandala.position.x).toBeGreaterThan(100);
    expect(world.scene.getObjectByName('mandala-open-centre')).toBeDefined();
    world.dispose();
  }
});
it('keeps the detailed rider pedalling in opposite phases, and freezes or resets without jumps', () => {
  const world = createWorld('low', 'kaleidoscope');
  const left = world.bike.getObjectByName('rider-shoe--1')!, right = world.bike.getObjectByName('rider-shoe-1')!;
  const initial = left.position.clone();
  world.update(1, 1, .1, 60);
  expect(left.position.equals(initial)).toBe(false);
  expect(left.position.y + right.position.y).toBeCloseTo(1.9);
  const moving = left.position.clone(); world.update(2, 1, 0, 80); expect(left.position).toEqual(moving);
  world.update(3, 1, .1, 0); expect(left.position).toEqual(moving);
  world.resetTargets(); expect(left.position).toEqual(initial);
  const helmet = world.bike.getObjectByName('rider-helmet') as THREE.Mesh;
  expect(helmet.geometry).toBeInstanceOf(THREE.SphereGeometry);
  world.dispose();
});
it('uses only fresh cadence while connected and a bounded estimate for power-only input', () => {
  const state = { status: 'connected', sample: { cadence: 80, cadenceAt: 1000, timestamp: 1000 } } as BikeState;
  expect(cyclingCadence(state, 1100, 90)).toBe(80);
  expect(cyclingCadence(state, 5000, 90)).toBe(0);
  expect(cyclingCadence({ ...state, status: 'disconnected' }, 1100, 90)).toBe(0);
  expect(cyclingCadence({ ...state, sample: { timestamp: 1000 } }, 1100, 90)).toBe(90);
  expect(cyclingCadence({ ...state, sample: { timestamp: 1000 } }, 1100, 300)).toBe(150);
});
it('uses curved, smoothly shaded individual feathers with bounded quality-scaled detail', () => {
  for (const quality of ['low', 'high'] as const) {
    const world = createWorld(quality, 'kaleidoscope');
    const wing = world.scene.getObjectByName('paradise-wing-1') as THREE.InstancedMesh;
    expect(wing.count).toBe(quality === 'low' ? 8 : 14);
    const positions = wing.geometry.getAttribute('position'); let min = Infinity, max = -Infinity;
    for (let i = 0; i < positions.count; i++) { min = Math.min(min, positions.getY(i)); max = Math.max(max, positions.getY(i)); }
    expect(max - min).toBeGreaterThan(.1); expect(wing.geometry.getAttribute('normal')).toBeDefined();
    expect(world.scene.getObjectByName('paradise-crest')).toBeDefined(); world.dispose();
  }
});

it('opens a separate lotus approach, retains its centre until passed, and wraps the gap smoothly across laps', () => {
  expect(lotusGapAt(0)).toBe(0);
  for (const lap of [0, 1, 5]) {
    const centre = LOTUS_DISTANCE + lap * JOURNEY_LENGTH;
    expect(lotusGapAt(centre - 400)).toBe(0); expect(lotusGapAt(centre - 300)).toBe(1);
    expect(lotusGapAt(centre + 100)).toBe(1); expect(lotusGapAt(centre + 190)).toBe(0);
    expect(lotusDistanceAt(centre + 100)).toBe(centre);
  }
  expect(lotusGapAt(JOURNEY_LENGTH - .001)).toBeCloseTo(lotusGapAt(JOURNEY_LENGTH + .001), 5);
  const world = createWorld('low', 'kaleidoscope');
  const flower = world.scene.getObjectByName('kaleidoscope-lotus')!;
  const petals: THREE.Object3D[] = []; flower.traverse(object => { if (object.name.startsWith('lotus-petal-')) petals.push(object); });
  expect(petals).toHaveLength(28);
  const surface = petals[0].children[0] as THREE.Mesh;
  expect(surface.geometry).not.toBeInstanceOf(THREE.SphereGeometry); expect(surface.geometry.getAttribute('normal')).toBeDefined();
  world.bike.position.set(routeX(LOTUS_DISTANCE), routeY(LOTUS_DISTANCE) - 3.2, 110 - LOTUS_DISTANCE);
  world.updateTunnel!(140, initialFlow(), true);
  for (const petal of petals) expect(petal.position.y).toBeGreaterThan(20);
  world.dispose();
});
