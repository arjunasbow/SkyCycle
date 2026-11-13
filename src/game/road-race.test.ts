import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createWorld, type Quality } from './world';
import { initialRace, roadX, roadHeight, roadHeading, ROAD_LENGTH, stepRace, racePosition, raceGuidance } from './race';
import { roadChunkOffset } from './road';
import { roadCameraPose } from './road-camera';

describe('Road Race 2.0', () => {
  it('ends sign supports at the board bottom and places readable lettering in front', () => {
    const world = createWorld('low', 'road');
    world.scene.getObjectByName('road-course')!.children.forEach(chunk => {
      const post = chunk.getObjectByName('sign-post') as THREE.InstancedMesh;
      const board = chunk.getObjectByName('road-sign') as THREE.InstancedMesh;
      const postMatrix = new THREE.Matrix4(), boardMatrix = new THREE.Matrix4();
      post.getMatrixAt(0, postMatrix); board.getMatrixAt(0, boardMatrix);
      const postPos = new THREE.Vector3(), postScale = new THREE.Vector3(), boardPos = new THREE.Vector3(), boardScale = new THREE.Vector3();
      postMatrix.decompose(postPos, new THREE.Quaternion(), postScale);
      boardMatrix.decompose(boardPos, new THREE.Quaternion(), boardScale);
      expect(postPos.y + postScale.y / 2).toBeCloseTo(boardPos.y - boardScale.y / 2, 4);
      const lettering = chunk.getObjectByName('sign-lettering')!;
      expect(lettering.children).toHaveLength(2);
      lettering.children.forEach(line => {
        expect(line.position.z).toBeGreaterThan(boardScale.z / 2);
        const geometry = (line as THREE.Mesh).geometry;
        geometry.computeBoundingBox();
        expect((geometry.boundingBox!.max.x - geometry.boundingBox!.min.x) * line.scale.x).toBeLessThanOrEqual(3.51);
      });
    });
    world.dispose();
  });
  it('shows attacks, recovery, repeated passes and useful separation at comfortable effort', () => {
    const race = initialRace(), ranges = race.riders.map(() => ({ min: Infinity, max: -Infinity, speedMin: Infinity, speedMax: 0, phases: new Set<string>() }));
    let passes = 0; const ahead = race.riders.map(r => r.distance > 0);
    for (let frame = 0; frame < 18000; frame++) {
      stepRace(race, 1, 'moderate', 1 / 60, true);
      race.riders.forEach((rider, i) => {
        const gap = rider.distance - race.distance, range = ranges[i];
        if (frame > 600) { range.min = Math.min(range.min, gap); range.max = Math.max(range.max, gap); range.speedMin = Math.min(range.speedMin, rider.speed); range.speedMax = Math.max(range.speedMax, rider.speed); }
        if (frame > 300 && ahead[i] !== (gap > 0)) passes++;
        ahead[i] = gap > 0; range.phases.add(rider.phase);
      });
    }
    expect(passes).toBeGreaterThan(8);
    expect(ranges[0].speedMax - ranges[0].speedMin).toBeGreaterThan(2);
    expect(ranges[0].max - ranges[0].min).toBeGreaterThan(25);
    ranges.forEach(range => expect(range.phases.size).toBe(3));
    expect(racePosition(race)).toBeGreaterThan(1); expect(racePosition(race)).toBeLessThan(6);
  });
  it('keeps modest effort competitive on every difficulty without changing player speed', () => {
    const results = [];
    for (const difficulty of ['gentle', 'moderate', 'challenging'] as const) {
      const race = initialRace(); for (let i = 0; i < 18000; i++) stepRace(race, 1.05, difficulty, 1 / 60, true);
      results.push(race);
    }
    expect(results[0].distance).toBe(results[2].distance);
    expect(racePosition(results[0])).toBeLessThanOrEqual(2);
    expect(racePosition(results[1])).toBeLessThanOrEqual(3);
    expect(racePosition(results[2])).toBeGreaterThan(racePosition(results[1]));
  });
  it('maintains smooth acceleration and separated passing lanes over an unlimited 40-minute ride', () => {
    const race = initialRace(); let minClearance = Infinity, maxAcceleration = 0;
    for (let frame = 0; frame < 2400 * 30; frame++) {
      const speeds = race.riders.map(r => r.speed);
      stepRace(race, 1, 'moderate', 1 / 30);
      race.riders.forEach((rider, i) => {
        maxAcceleration = Math.max(maxAcceleration, Math.abs(rider.speed - speeds[i]) * 30);
        minClearance = Math.min(minClearance, Math.abs(rider.lane));
        for (const other of race.riders.slice(i + 1)) minClearance = Math.min(minClearance, Math.abs(other.lane - rider.lane));
      });
    }
    expect(race.elapsed).toBeCloseTo(2400); expect(race.distance).toBeGreaterThan(ROAD_LENGTH * 5);
    expect(minClearance).toBeGreaterThan(1.4); expect(maxAcceleration).toBeLessThan(8);
    race.riders.forEach(rider => expect(Number.isFinite(rider.distance)).toBe(true));
  });
  it('sprints only in timed mode and freezes at the five-minute finish', () => {
    const timed = initialRace(), scenic = initialRace();
    for (let i = 0; i < 18000; i++) { stepRace(timed, 1, 'moderate', 1 / 60, true); stepRace(scenic, 1, 'moderate', 1 / 60); }
    expect(timed.elapsed).toBe(300); expect(timed.riders[0].distance).toBeGreaterThan(scenic.riders[0].distance + 5);
    const snapshot = structuredClone(timed); stepRace(timed, 1, 'moderate', 1 / 60, true); expect(timed).toEqual(snapshot);
    stepRace(scenic, 1, 'moderate', 1 / 60); expect(scenic.elapsed).toBeGreaterThan(300);
    expect(raceGuidance(timed, true).target).toContain('Final sprint'); expect(raceGuidance(scenic).target).not.toContain('Final sprint');
  });
  it('keeps hills, camera and chunk coordinates periodic without visible recycling', () => {
    for (let d = -100; d <= ROAD_LENGTH + 100; d += 17) {
      expect(roadHeight(d)).toBeCloseTo(roadHeight(d + ROAD_LENGTH)); expect(roadHeading(d)).toBeCloseTo(roadHeading(d + ROAD_LENGTH));
      for (let center = 100; center < ROAD_LENGTH; center += 200) {
        const gap = center + roadChunkOffset(center, d) - d;
        expect(gap).toBeGreaterThanOrEqual(-300); expect(gap).toBeLessThanOrEqual(2300);
        const before = roadChunkOffset(center, d - .01);
        if (before !== roadChunkOffset(center, d)) { expect(gap).toBeGreaterThan(2200); }
      }
    }
    const race = initialRace(); race.speed = 8;
    race.distance = ROAD_LENGTH - .001; const before = roadCameraPose(race);
    race.distance = ROAD_LENGTH + .001; const after = roadCameraPose(race);
    expect(after.z - before.z).toBeCloseTo(ROAD_LENGTH, 1); expect(after.x).toBeCloseTo(before.x, 2); expect(after.y).toBeCloseTo(before.y, 2);
    const still = roadCameraPose(race, false); expect(still.roll).toBe(0); expect(still.fov).toBe(60);
    for (let d = 0; d < ROAD_LENGTH; d += 13) { race.distance = d; const view = roadCameraPose(race); expect(Math.abs(view.roll)).toBeLessThanOrEqual(.018); expect(view.fov).toBeLessThanOrEqual(65); expect(view.y).toBeGreaterThan(roadHeight(d) + 2.9); }
  });
  it.each<Quality>(['low', 'medium', 'high'])('reuses scenery, animates pedals and disposes all resources at %s quality', quality => {
    const world = createWorld(quality, 'road'), race = initialRace();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), instances: THREE.InstancedMesh[] = [];
    let count = 0;
    world.scene.traverse(o => { count++; if (o instanceof THREE.Mesh || o instanceof THREE.Points) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } if (o instanceof THREE.InstancedMesh) instances.push(o); });
    const spies = [...geometries, ...materials, ...instances].map(resource => vi.spyOn(resource, 'dispose'));
    world.updateRace!(race, false);
    const leg = world.bike.getObjectByName('rider-thigh-1')!; const initial = leg.quaternion.clone();
    for (let i = 0; i < 600; i++) stepRace(race, 1, 'moderate', 1 / 60);
    world.updateRace!(race, false); expect(leg.quaternion.equals(initial)).toBe(false);
    const pose = leg.quaternion.clone(); world.updateRace!(race, false, 0); expect(leg.quaternion.equals(pose)).toBe(true);
    race.distance = ROAD_LENGTH + 35; world.updateRace!(race, false);
    expect(world.scene.getObjectByName('road-chunk-12')!.position.z).toBe(ROAD_LENGTH);
    let after = 0; world.scene.traverse(() => after++); expect(after).toBe(count);
    expect(instances.length).toBeLessThan(300);
    world.dispose(); spies.forEach(spy => expect(spy).toHaveBeenCalledOnce()); expect(world.scene.children).toHaveLength(0);
  });
  it('holds the finish gate at one course distance and resets it for the next ride', () => {
    const world = createWorld('low', 'road'), race = initialRace(); race.elapsed = 288; race.speed = 6; race.distance = 1800;
    world.updateRace!(race, true); const gate = world.scene.getObjectByName('race-finish')!, z = gate.position.z;
    race.elapsed = 292; race.distance += 25; race.speed = 7; world.updateRace!(race, true); expect(gate.position.z).toBeCloseTo(z);
    world.updateRace!(initialRace(), false); expect(gate.visible).toBe(false);
    race.elapsed = 288; race.distance = 1500; world.updateRace!(race, true); expect(gate.position.z).not.toBe(z);
    world.dispose();
  });
});
