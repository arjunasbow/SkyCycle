import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createWorld, terrainHeight, type Quality } from './world';
import { initialValleyCompanion } from './valley-companion';
import { nearValleyRace, valleyRaceHeight, valleyRacePlan, VALLEY_RACE_LENGTH } from './valley-race';

it('crosses the valley left to right, spans the river and climbs to the finish',()=>{
  let lastX=-Infinity;
  for(let d=0;d<=VALLEY_RACE_LENGTH;d++){
    const p=valleyRacePlan(d);expect(p.x).toBeGreaterThan(lastX);lastX=p.x;
    const y=valleyRaceHeight(d,terrainHeight);expect(y).toBeGreaterThanOrEqual(terrainHeight(p.x,p.z)+.49);
    expect(nearValleyRace(p.x,p.z)).toBe(true);expect(nearValleyRace(p.x,p.z+25)).toBe(false);
  }
  for(let x=-163;x<=-68;x+=5){const p=valleyRacePlan(x+350);expect(p.z).toBe(-850);expect(valleyRaceHeight(x+350,terrainHeight)).toBeCloseTo(6);}
  expect(valleyRaceHeight(VALLEY_RACE_LENGTH,terrainHeight)).toBeGreaterThan(25);
});
it.each<Quality>(['low','medium','high'])('adds one bounded aerial race and preserves the flight course at %s',quality=>{
  const world=createWorld(quality,'valley','enhanced',true),other=createWorld(quality,'space');
  const root=world.scene.getObjectByName('valley-race-below')!;
  expect(world.targets).toEqual(other.targets);
  expect(other.scene.getObjectByName('valley-race-below')).toBeUndefined();
  for(const name of ['valley-race-road','valley-race-bridge','valley-race-finish','valley-race-chequered-line'])expect(root.getObjectByName(name)).toBeDefined();
  expect(root.children.filter(o=>o.name.startsWith('valley-mini-racer-'))).toHaveLength(6);
  const road=root.getObjectByName('valley-race-road') as THREE.Mesh;
  const normals=road.geometry.getAttribute('normal');for(let i=0;i<normals.count;i++)expect(normals.getY(i)).toBeGreaterThan(.5);
  const state=initialValleyCompanion(),rider=root.getObjectByName('valley-mini-racer-0')!,follower=root.getObjectByName('valley-mini-racer-4')!;
  const start=rider.position.clone();world.updateValley!(42,state,false);expect(rider.position.x).toBeGreaterThan(start.x);
  expect(rider.position.x-follower.position.x).toBeGreaterThan(15);
  const paused=rider.position.clone(),rotation=rider.quaternion.clone();world.updateValley!(42,state,false);expect(rider.position).toEqual(paused);expect(rider.quaternion.equals(rotation)).toBe(true);
  world.updateValley!(72,state,true);const quiet=rider.position.clone();world.updateValley!(99,state,true);expect(rider.position).toEqual(quiet);
  world.updateValley!(88,state,false);expect(follower.position.x).toBeGreaterThan(330); // The whole pack reaches the finish.
  const geometry=new Set<THREE.BufferGeometry>(),material=new Set<THREE.Material>(),instances:THREE.InstancedMesh[]=[];
  let count=0;world.scene.traverse(o=>{count++;if(o instanceof THREE.Mesh||o instanceof THREE.Points){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])material.add(m);}if(o instanceof THREE.InstancedMesh)instances.push(o);});
  const spies=[...geometry,...material,...instances].map(r=>vi.spyOn(r,'dispose'));
  for(let time=0;time<10000;time+=13)world.updateValley!(time,state,false);
  let after=0;world.scene.traverse(()=>after++);expect(after).toBe(count);
  world.dispose();other.dispose();for(const spy of spies)expect(spy).toHaveBeenCalledOnce();
});
