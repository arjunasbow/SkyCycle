import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('three/webgpu',async importOriginal=>{
  const original=await importOriginal<typeof import('three/webgpu')>();
  return {...original,WebGPURenderer:class{
    backend={isWebGPUBackend:true};info={autoReset:true,reset(){}};shadowMap={enabled:false,type:0};
    async init(){}setPixelRatio(){}async compileAsync(){}dispose(){}
  },PostProcessing:class{render(){}dispose(){}}};
});
import { createWorld, type Quality } from './world';
import { initialRace, stepRace, ROAD_LENGTH } from './race';
import { createCinematic } from './cinematic';

it.each<Quality>(['low','medium','high'])('builds detailed road scenery and bounded shared bicycle geometry at %s',quality=>{
  const world=createWorld(quality,'road','enhanced',true);
  for(const name of ['bridge-arches','balcony-balusters','window-shutters','chimney-caps','cinematic-stream','detail-grass','detail-flower-heads','village-tower'])expect(world.scene.getObjectByName(name)).toBeDefined();
  expect(world.bike.userData.components).toContain('water-bottle');
  const helmets=world.bike.getObjectByName('rider-helmet') as THREE.Mesh;expect(helmets.geometry).toBeInstanceOf(THREE.SphereGeometry);
  const spokes=world.bike.getObjectByName('wheel-spokes') as THREE.InstancedMesh;expect(spokes.count).toBe(quality==='low'?16:24);
  const rivals=world.scene.children.filter(object=>object.name==='simulated-racer');expect(rivals).toHaveLength(5);
  const jerseys=new Set<number>();
  for(const rival of rivals)rival.traverse(object=>{if(object instanceof THREE.Mesh&&!Array.isArray(object.material)&&object.material.name==='rider-jersey')jerseys.add((object.material as THREE.MeshLambertMaterial).color.getHex());});
  expect(jerseys.size).toBe(5);
  let bicycleDraws=0;world.bike.traverse(object=>{if(object instanceof THREE.Mesh)bicycleDraws++;});expect(bicycleDraws).toBeLessThan(38);
  const stones=world.scene.getObjectByName('river-stones') as THREE.InstancedMesh;expect(stones.count).toBe(10);
  world.dispose();
});
it('pedals shoes, knees, cranks and wheels independently for each rider, freezing on pause',()=>{
  const world=createWorld('low','road','enhanced',true),race=initialRace();world.updateRace!(race,false);
  const shoe=world.bike.getObjectByName('rider-shoe-1')!,wheel=world.bike.getObjectByName('road-front-wheel')!;
  const first=shoe.position.clone(),initialWheel=wheel.rotation.z;
  for(let i=0;i<100;i++)stepRace(race,1,'moderate',1/60);
  world.updateRace!(race,false);expect(shoe.position.equals(first)).toBe(false);expect(wheel.rotation.z).not.toBe(initialWheel);
  const paused=shoe.position.clone(),phase=wheel.rotation.z;world.updateRace!(race,false,0);expect(shoe.position).toEqual(paused);expect(wheel.rotation.z).toBe(phase);
  const rival=world.scene.children.find(object=>object.name==='simulated-racer')!;expect(rival.getObjectByName('rider-shoe-1')!.position).not.toEqual(shoe.position);
  world.dispose();
});
it('keeps unlimited scenery bounded, preserves race state and disposes every attached resource',()=>{
  const world=createWorld('low','road','enhanced',true),race=initialRace();let count=0;world.scene.traverse(()=>count++);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),batches:THREE.InstancedMesh[]=[];
  world.scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Points){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}if(object instanceof THREE.InstancedMesh)batches.push(object);});
  const spies=[...geometries,...materials,...batches].map(resource=>vi.spyOn(resource,'dispose'));
  for(let i=0;i<900;i++){race.distance=i*31;race.elapsed=i*4;race.riders.forEach((rider,j)=>{rider.distance=race.distance+12-j*9;});const snapshot=JSON.stringify(race);world.updateRace!(race,false);expect(JSON.stringify(race)).toBe(snapshot);}
  let after=0;world.scene.traverse(()=>after++);expect(after).toBe(count);
  race.distance=ROAD_LENGTH+35;world.updateRace!(race,false);expect(world.scene.getObjectByName('road-chunk-12')!.position.z).toBe(ROAD_LENGTH);
  world.dispose();for(const spy of spies)expect(spy).toHaveBeenCalledOnce();expect(world.scene.children).toHaveLength(0);
});
it.each<Quality>(['low','medium','high'])('prepares native road nodes, daylight and bounded shadows at %s',async quality=>{
  vi.stubGlobal('navigator',{gpu:{}});vi.stubGlobal('window',{devicePixelRatio:2});
  const world=createWorld(quality,'road','enhanced',true),camera=new THREE.PerspectiveCamera(),graphics=await createCinematic(quality,'road');
  try{
    world.updateRace!(initialRace(),false);await graphics.prepare(world.scene,camera);
    const road=world.scene.getObjectByName('race-road') as THREE.Mesh;expect((road.material as unknown as {isNodeMaterial:boolean}).isNodeMaterial).toBe(true);
    expect(world.scene.getObjectByName('cinematic-daylight-sky')).toBeDefined();expect(world.scene.getObjectByName('cinematic-light-veils')).toBeUndefined();
    expect((graphics.renderer as unknown as {shadowMap:{enabled:boolean}}).shadowMap.enabled).toBe(quality!=='low');
    const sun=world.scene.children.find(object=>object instanceof THREE.DirectionalLight) as THREE.DirectionalLight;expect(sun.shadow.autoUpdate).toBe(false);expect(sun.shadow.camera.right).toBe(78);
    const children=world.scene.children.length;for(let i=0;i<50;i++){camera.position.z=-i*100;graphics.render(world.scene,camera,i,i%2===0,1/60);}expect(world.scene.children.length).toBe(children);
    const sky=world.scene.getObjectByName('cinematic-daylight-sky')!;expect(sky.position).toEqual(camera.position);
    graphics.dispose();world.dispose();
  }finally{vi.unstubAllGlobals();}
});
it('leaves the standard road scene and original bike available for comparison',()=>{
  const world=createWorld('low','road');expect(world.scene.getObjectByName('bridge-arches')).toBeUndefined();expect(world.bike.userData.components).toBeUndefined();world.dispose();
});
