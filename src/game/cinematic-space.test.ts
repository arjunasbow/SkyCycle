import { expect,it,vi } from 'vitest';
import * as THREE from 'three';
vi.mock('three/webgpu',async importOriginal=>{
  const original=await importOriginal<typeof import('three/webgpu')>();
  return {...original,WebGPURenderer:class{
    backend={isWebGPUBackend:true};info={autoReset:true,reset(){}};shadowMap={enabled:false,type:0};
    async init(){}setPixelRatio(){}async compileAsync(){}dispose(){}
  },PostProcessing:class{render(){}dispose(){}}};
});
import { createWorld,type Quality } from './world';
import { createCinematic } from './cinematic';
import { initialValleyCompanion,stepValleyCompanion } from './valley-companion';
import { initialFlight } from './flight';
it.each<Quality>(['low','medium','high'])('prepares detailed dark Space and retains the flight course at %s',async quality=>{
  vi.stubGlobal('navigator',{gpu:{}});vi.stubGlobal('window',{devicePixelRatio:2});
  const standard=createWorld(quality,'space'),world=createWorld(quality,'space','enhanced',true),camera=new THREE.PerspectiveCamera(),graphics=await createCinematic(quality,'space');
  try{
    expect(world.targets).toEqual(standard.targets);expect(world.scene.background).toEqual(new THREE.Color(0x06091e));
    expect(world.bike.name).toBe('cinematic-space-bike');expect(world.bike.getObjectByName('rocket-thrusters')).toBeDefined();expect(world.propeller.visible).toBe(false);
    const shoe=world.bike.getObjectByName('rider-shoe-1')!,before=shoe.position.clone();world.update(1,1,1/60,80);expect(shoe.position).not.toEqual(before);
    const moon=world.scene.getObjectByName('cratered-moon') as THREE.Mesh,positions=moon.geometry.getAttribute('position');let min=Infinity,max=0;
    for(let i=0;i<positions.count;i++){const r=Math.hypot(positions.getX(i),positions.getY(i),positions.getZ(i));min=Math.min(min,r);max=Math.max(max,r);}expect(max-min).toBeGreaterThan(.025);
    const starfield=world.scene.getObjectByName('starfield') as THREE.Points;expect(starfield.geometry.getAttribute('position').count).toBeGreaterThan((standard.scene.getObjectByName('starfield') as THREE.Points).geometry.getAttribute('position').count);
    await graphics.prepare(world.scene,camera);
    const planet=world.scene.getObjectByName('planet') as THREE.Mesh;expect((planet.material as unknown as {isNodeMaterial:boolean}).isNodeMaterial).toBe(true);expect(planet.geometry.getAttribute('color')).toBeDefined();
    const atmosphere=world.scene.getObjectByName('planet-atmosphere') as THREE.Mesh;expect((atmosphere.material as unknown as {isNodeMaterial:boolean}).isNodeMaterial).toBe(true);
    expect(world.scene.getObjectByName('cinematic-light-veils')).toBeUndefined();expect(world.scene.getObjectByName('cinematic-daylight-sky')).toBeUndefined();
    expect(world.scene.getObjectByName('sputnik-companion')!.visible).toBe(false);
    const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),instances:THREE.InstancedMesh[]=[];let count=0;
    world.scene.traverse(o=>{count++;if(o instanceof THREE.Mesh||o instanceof THREE.Points){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}if(o instanceof THREE.InstancedMesh)instances.push(o);});
    const spies=[...geometry,...materials,...instances].map(resource=>vi.spyOn(resource,'dispose'));
    const state=initialValleyCompanion();for(let i=0;i<300;i++){world.updateSpace!(i,state,false);world.update(i,1,1/60,80);graphics.render(world.scene,camera,i,false,1/60);}
    let after=0;world.scene.traverse(()=>after++);expect(after).toBe(count);
    world.dispose();graphics.dispose();for(const spy of spies)expect(spy).toHaveBeenCalledOnce();
  }finally{standard.dispose();vi.unstubAllGlobals();}
});
it('earns Sputnik after 30 active route seconds, loses it outside and resets the wait',()=>{
  const world=createWorld('low','space'),state=initialValleyCompanion(),pose=initialFlight(),satellite=world.scene.getObjectByName('sputnik-companion')!;
  for(let i=0;i<1799;i++)stepValleyCompanion(state,pose,pose,world.targets,1/60);world.updateSpace!(29.9,state,false);expect(satellite.visible).toBe(false);
  stepValleyCompanion(state,pose,pose,world.targets,1/60);world.updateSpace!(30,state,false);expect(satellite.visible).toBe(true);
  for(let i=1;i<150;i++)world.updateSpace!(30+i/60,state,false);
  const paused=satellite.position.clone(),rotation=satellite.quaternion.clone();world.updateSpace!(32.483333333333334,state,false);expect(satellite.position.distanceTo(paused)).toBeLessThan(1e-8);expect(satellite.quaternion.angleTo(rotation)).toBeLessThan(1e-6);
  stepValleyCompanion(state,pose,{...pose,y:100},world.targets,1/60);for(let i=0;i<70;i++)world.updateSpace!(33+i/60,state,false);expect(satellite.visible).toBe(false);
  for(let i=0;i<1799;i++)stepValleyCompanion(state,pose,pose,world.targets,1/60);world.updateSpace!(63,state,false);expect(satellite.visible).toBe(false);
  stepValleyCompanion(state,pose,pose,world.targets,1/60);world.updateSpace!(64,state,true);expect(satellite.visible).toBe(true);
  const quiet=satellite.position.clone();world.updateSpace!(84,state,true);expect(satellite.position).toEqual(quiet);
  world.resetSpace!();expect(satellite.visible).toBe(false);world.dispose();
});
