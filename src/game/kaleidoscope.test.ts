import { expect, it } from 'vitest';
import * as THREE from 'three';
import { initialFlight } from './flight';
import { CHAPTER_LENGTH, FLOW, JOURNEY_LENGTH, chapterAt, corridorRadius, distanceAt, inCorridor, initialFlow, lotusOpening, routeX, routeY, stepFlow, stepTunnel, tunnelHint } from './kaleidoscope';
import { createWorld } from './world';

function pose(d = 0) { return { ...initialFlight(), x: routeX(d), y: routeY(d) - 3.2, z: 110 - d }; }
function advance(flow: ReturnType<typeof initialFlow>, seconds: number, outside = false) {
  const s = pose(); if (outside) s.y += 30;
  for (let i = 0; i < Math.round(seconds * 60); i++) { s.elapsed += 1 / 60; stepFlow(flow, s, 1 / 60); }
}
it('detects the curved corridor and uses a dead band at both boundaries', () => {
  for (const d of [0, 400, 1380, 2760, 40000]) {
    const s = pose(d); expect(inCorridor(s, false)).toBe(true);
    s.y += corridorRadius(d); expect(inCorridor(s, true)).toBe(true); expect(inCorridor(s, false)).toBe(false);
    s.y += FLOW.tolerance + .01; expect(inCorridor(s, true)).toBe(false);
    s.y = routeY(d) - 3.2 - corridorRadius(d) - 1; expect(inCorridor(s, true)).toBe(false);
  }
});
it('scores accumulated seconds, advances capped multipliers and rewards re-entry without removing points', () => {
  const flow = initialFlow(); advance(flow, 5); expect(flow.score).toBe(100);
  advance(flow, 10); expect(flow.multiplier).toBe(2); expect(flow.score).toBe(400);
  advance(flow, 15); expect(flow.multiplier).toBe(3); expect(flow.score).toBe(1100);
  advance(flow, 1, true); expect(flow.score).toBe(1100); expect(flow.charge).toBeCloseTo(28);
  advance(flow, 1); expect(flow.multiplier).toBe(3); expect(flow.ripple).toBeGreaterThan(-100);
  advance(flow, 3, true); expect(flow.multiplier).toBe(1); expect(flow.streak).toBe(0); expect(flow.score).toBe(1100);
  advance(flow, 4); expect(flow.score).toBe(1200);
});
it('freezes every flow field on pause and rejects frame gaps; stale input earns no points', () => {
  const flow = initialFlow(); advance(flow, 14); const before = { ...flow };
  stepFlow(flow, pose(2800), 1 / 60, false); stepFlow(flow, pose(2800), 10);
  expect(flow).toEqual(before);
  for (let i = 0; i < 240; i++) stepFlow(flow, pose(), 1 / 60, true, false);
  expect(flow.score).toBe(before.score); expect(flow.multiplier).toBe(1);
});
it('retains a 3x multiplier when continuous progress crosses 15 seconds after a brief excursion', () => {
  const flow = initialFlow(); advance(flow, 30); advance(flow, 1, true); advance(flow, 16);
  expect(flow.multiplier).toBe(3);
  for (const d of [1380, 2760]) expect(Math.abs(routeY(d + 1) - routeY(d))).toBeLessThan(.011);
});
it('supports a full journey at modest continuous effort with the existing flight model', () => {
  const s = initialFlight(), flow = initialFlow(); let inside = 0, min = 2, max = 0;
  for (let i = 0; i < 60 * 400; i++) {
    const effort = tunnelHint(s); min = Math.min(min, effort); max = Math.max(max, effort);
    stepTunnel(s, effort, 1 / 60); stepFlow(flow, s, 1 / 60);
    if (inCorridor(s, false)) inside++;
  }
  expect(inside / (60 * 400)).toBeGreaterThan(.98);
  expect(min).toBeGreaterThan(.82); expect(max).toBeLessThan(1.18);
  expect(distanceAt(s.z)).toBeGreaterThan(JOURNEY_LENGTH * 2); expect(flow.score).toBeGreaterThan(10000);
});
it('blends a continuous unlimited course with chapters about 35 seconds at cruise', () => {
  for (let i = 1; i < 80; i++) {
    const d = i * CHAPTER_LENGTH;
    expect(chapterAt(d)).toBe(i % 4);
    expect(Math.abs(routeY(d - .001) - routeY(d + .001))).toBeLessThan(.001);
    expect(Math.abs(routeX(d - .001) - routeX(d + .001))).toBeLessThan(.001);
  }
  expect(CHAPTER_LENGTH / 20).toBeGreaterThan(30); expect(CHAPTER_LENGTH / 20).toBeLessThan(45);
});
it('guarantees a safe lotus aperture before arrival and gives a once-per-encounter flow bonus', () => {
  expect(lotusOpening(600, 0)).toBe(0); expect(lotusOpening(40, 0)).toBeGreaterThanOrEqual(.8);
  expect(lotusOpening(0, 30)).toBe(1);
  const flow = initialFlow(); advance(flow, 30); const score = flow.score;
  stepFlow(flow, pose(2761), 1 / 60); expect(flow.score).toBe(score + 1500);
  stepFlow(flow, pose(2762), 1 / 60); expect(flow.score).toBe(score + 1500);
  stepFlow(flow, pose(2761 + JOURNEY_LENGTH), 1 / 60); expect(flow.score).toBe(score + 3000);
});
it('keeps scene pools bounded across unlimited chapters and disposes all resources at every quality', () => {
  for (const quality of ['low', 'medium', 'high'] as const) {
    const world = createWorld(quality, 'kaleidoscope'); expect(world.targets).toHaveLength(0);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(); let disposed = 0, batches = 0, batchDisposals = 0;
    world.scene.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); }
      if (o instanceof THREE.InstancedMesh) { batches++; o.addEventListener('dispose', () => batchDisposals++); }
    });
    const children = world.scene.children.length;
    const flow = initialFlow();
    for (let d = 0; d < 100000; d += 411) { world.bike.position.set(routeX(d), routeY(d) - 3.2, 110 - d); world.updateTunnel!(d / 20, flow, false); }
    world.updateTunnel!(5000, flow, true); world.resetTargets(); expect(world.scene.children).toHaveLength(children);
    for (const g of geometries) g.addEventListener('dispose', () => disposed++);
    for (const m of materials) m.addEventListener('dispose', () => disposed++);
    world.dispose(); expect(disposed).toBe(geometries.size + materials.size); expect(batchDisposals).toBe(batches); expect(world.scene.children).toHaveLength(0);
    const valley = createWorld('low', 'valley', 'classic'), space = createWorld('low', 'space'), road = createWorld('low', 'road');
    expect(valley.targets).toHaveLength(26); expect(space.targets).toEqual(valley.targets); expect(road.targets).toHaveLength(0);
    valley.dispose(); space.dispose(); road.dispose();
  }
});
