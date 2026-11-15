import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('three/webgpu',async importOriginal=>{
  const original=await importOriginal<typeof import('three/webgpu')>();
  return {...original,WebGPURenderer:class{
    backend={isWebGPUBackend:true};info={autoReset:true,reset(){}};shadowMap={enabled:false,type:0};
    async init(){}setPixelRatio(){}async compileAsync(){}dispose(){}
  },PostProcessing:class{render(){}dispose(){}}};
});
import { createWorld, terrainHeight, type Quality } from './world';
import { alpineHeight } from './enhanced-valley';
import { createCinematic } from './cinematic';

it.each<Quality>(['low','medium','high'])('adds detailed Valley artwork, native daylight and a pedalling flying bike at %s',async quality=>{
  vi.stubGlobal('navigator',{gpu:{}});vi.stubGlobal('window',{devicePixelRatio:2});
  const standard=createWorld(quality,'valley'),world=createWorld(quality,'valley','enhanced',true),camera=new THREE.PerspectiveCamera(),graphics=await createCinematic(quality,'valley');
  try{
    expect(world.targets).toEqual(standard.targets);
    expect(world.scene.getObjectByName('rocks')).toBeUndefined();
    for(const name of ['detail-chalet-shutters','detail-balcony','detail-window-sills','valley-bridge-arches','detail-flowers','valley-zeppelins'])expect(world.scene.getObjectByName(name)).toBeDefined();
    const crown=world.scene.getObjectByName('crowns') as THREE.InstancedMesh;expect(crown.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(world.propeller.parent).toBe(world.bike);expect(world.propeller.children.length).toBeGreaterThan(0);
    const shoe=world.bike.getObjectByName('rider-shoe-1')!,wheel=world.bike.getObjectByName('road-front-wheel')!,initial=shoe.position.clone();
    world.update(1,1,1/60,80);expect(shoe.position).not.toEqual(initial);expect(wheel.rotation.z).toBeLessThan(0);
    const paused=shoe.position.clone(),rotation=world.propeller.rotation.z;world.update(1,1,0,80);expect(shoe.position).toEqual(paused);expect(world.propeller.rotation.z).toBe(rotation);
    const land=world.scene.getObjectByName('alpine-terrain') as THREE.Mesh;const positions=land.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i+=113){const x=positions.getX(i),z=positions.getZ(i);expect(positions.getY(i)).toBeCloseTo(alpineHeight(x,z,terrainHeight),3);}
    await graphics.prepare(world.scene,camera);
    expect(world.scene.getObjectByName('valley-curious-bird')!.visible).toBe(false);
    for(const name of ['flowing-river','alpine-terrain','cinematic-daylight-sky']){
      const mesh=world.scene.getObjectByName(name) as THREE.Mesh;expect((mesh.material as unknown as {isNodeMaterial:boolean}).isNodeMaterial).toBe(true);
    }
    let glsl=0;world.scene.traverse(object=>{if(object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial)glsl++;});expect(glsl).toBe(0);
    expect(world.scene.getObjectByName('cinematic-light-veils')).toBeUndefined();
    expect((graphics.renderer as unknown as {shadowMap:{enabled:boolean}}).shadowMap.enabled).toBe(quality!=='low');
    const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();world.scene.traverse(object=>{if(object instanceof THREE.Mesh || object instanceof THREE.Points){geos.add(object.geometry);for(const mat of Array.isArray(object.material)?object.material:[object.material])mats.add(mat);}});
    const spies=[...geos,...mats].map(resource=>vi.spyOn(resource,'dispose'));
    const children=world.scene.children.length;
    for(let i=0;i<60;i++){world.bike.position.z=110-i*40;world.update(i,1,1/60,80);graphics.render(world.scene,camera,i,false,1/60);}
    expect(world.scene.children.length).toBe(children);
    world.dispose();graphics.dispose();for(const spy of spies)expect(spy).toHaveBeenCalledOnce();
  } finally {standard.dispose();vi.unstubAllGlobals();}
});
it('uses enhanced artwork for Cinematic even when a classic comparison preference is stored',()=>{
  const world=createWorld('low','valley','classic',true);expect(world.scene.getObjectByName('enhanced-valley')).toBeDefined();world.dispose();
});
