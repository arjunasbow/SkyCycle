import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshLambertNodeMaterial, MeshStandardNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import { color, float, fract, instanceIndex, mix, positionLocal, positionWorld, sin, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import type { Quality } from './world';
/** Native WebGPU road shaders, a daylight sky and bounded, infrequently refreshed scenery shadows. */
export function prepareCinematicRoad(scene:THREE.Scene,renderer:WebGPURenderer,quality:Quality,camera:THREE.Camera,replaced:Set<THREE.Material>, valley = false) {
  const time=uniform(0), cache=new Map<THREE.Material,THREE.Material>();
  const sun=scene.children.find(object=>object instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
  const shadows=quality!=='low'; renderer.shadowMap.enabled=shadows; renderer.shadowMap.type=THREE.PCFShadowMap;
  scene.children.forEach(object=>{if(object instanceof THREE.HemisphereLight){object.intensity=1.35;object.color.set(0xe5edf0);object.groundColor.set(0x6c7759);}});
  sun.intensity=2.0;sun.color.set(0xffe3ba);sun.castShadow=shadows;
  sun.shadow.mapSize.setScalar(quality==='high'?1536:1024);sun.shadow.camera.left=-78;sun.shadow.camera.right=78;sun.shadow.camera.top=78;sun.shadow.camera.bottom=-78;sun.shadow.camera.near=1;sun.shadow.camera.far=260;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-.0003;sun.shadow.normalBias=.18;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;scene.add(sun.target);
  scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||Array.isArray(object.material))return;
    const original=object.material;
    if(original.name==='cinematic-road-asphalt'){
      let material=cache.get(original);
      if(!material){
        const asphalt=new MeshStandardNodeMaterial({color:0x465057,roughness:.97,metalness:0});
        const p=uv(), grain=fract(sin(p.x.mul(371).floor().mul(12.9898).add(p.y.mul(53).floor().mul(78.233))).mul(43758.5453));
        const patches=sin(p.y.mul(.037)).mul(sin(p.y.mul(.11).add(p.x.mul(13))));
        const canopy=smoothstep(.72,.98,sin(p.y.mul(.19).add(p.x.mul(3)))).mul(.19).mul(sin(p.y.mul(.009)).mul(.5).add(.5));
        asphalt.colorNode=color(0x465057).mul(grain.sub(.5).mul(.075).add(patches.mul(.065)).add(1).sub(canopy));
        material=asphalt;cache.set(original,material);replaced.add(original);
      }
      object.material=material;
    }else if(original.name==='cinematic-stream-water'){
      let material=cache.get(original);
      if(!material){const water=new MeshStandardNodeMaterial({roughness:.32,metalness:.12});
        const wave=sin(positionWorld.x.mul(.22).add(time.mul(.7)).add(sin(positionWorld.z.mul(.35).sub(time.mul(.4))))).mul(.5).add(.5);
        water.colorNode=mix(color(0x3f7a83),color(0x77a8ac),wave);material=water;cache.set(original,material);replaced.add(original);}
      object.material=material;
    }else if(/conifers|broadleaf|bushes|detail-grass|riverbank-reeds|^pines$|^crowns$/.test(object.name)){
      let material=cache.get(original);
      if(!material){const leaf=new MeshLambertNodeMaterial({color:(original as THREE.MeshLambertMaterial).color,side:original.side});
        const bend=positionLocal.y.max(0).pow(2).mul(.017);
        const phase=float(instanceIndex).mul(.73);
        leaf.positionNode=positionLocal.add(vec3(sin(time.mul(.65).add(phase)).mul(bend),0,sin(time.mul(.47).add(phase)).mul(bend).mul(.5)));
        material=leaf;cache.set(original,material);replaced.add(original);}
      object.material=material;
    }
    object.receiveShadow=shadows && !object.name.includes('contact-shadow');
    object.castShadow=shadows && /tree-trunks|tree-branches|conifers|broadleaf|chalets|chalet-roofs|chimney|bridge-arches|bridge-stone|village-tower|tower-roof|^trunks$|^pines$|^crowns$|^houses$|^roofs$|^ruins$/.test(object.name);
  });
  // A source material may still be used by unmodified flower/field batches.
  scene.traverse(object=>{if(object instanceof THREE.Mesh){for(const material of Array.isArray(object.material)?object.material:[object.material])replaced.delete(material);}});
  const skyMaterial=new MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false,fog:false});
  skyMaterial.colorNode=mix(color(0xc7d9dc),color(0x739bb5),smoothstep(-.12,.85,positionLocal.normalize().y));
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1450,32,16),skyMaterial);sky.name='cinematic-daylight-sky';sky.frustumCulled=false;scene.add(sky);
  const clouds=new THREE.Group();clouds.name='cinematic-road-clouds';scene.add(clouds);
  const cloudGeo=new THREE.SphereGeometry(1,quality==='low'?10:16,10),cloudMat=new THREE.MeshLambertMaterial({color:0xd9e0df});
  const cloudCount=quality==='low'?3:quality==='medium'?5:8;
  for(let i=0;i<(valley?0:cloudCount);i++)for(let j=0;j<4;j++){const puff=new THREE.Mesh(cloudGeo,cloudMat);puff.position.set(Math.sin(i*2.1)*620+j*23,185+(i%3)*35+(j%2)*8,-260-i*110);puff.scale.set(42,12+(j%2)*6,24);clouds.add(puff);}
  const sunlightOffset=new THREE.Vector3(-65,115,55),focus=new THREE.Vector3(),lastFocus=new THREE.Vector3(Infinity,Infinity,Infinity);let shadowAge=1;
  const update=(view:THREE.Camera,elapsed:number,reduced:boolean,dt:number)=>{
    time.value=reduced?0:elapsed;sky.position.copy(view.position);clouds.position.set(view.position.x*.12+(reduced?0:Math.sin(elapsed*.008)*20),0,view.position.z);
    focus.set(view.position.x,view.position.y-6,view.position.z-28);shadowAge+=dt;
    if(shadows&&(focus.distanceToSquared(lastFocus)>144||shadowAge>.65)){
      sun.target.position.copy(focus);sun.position.copy(focus).add(sunlightOffset);sun.shadow.needsUpdate=true;lastFocus.copy(focus);shadowAge=0;
    }
  };
  update(camera,0,false,0);
  return {update,dispose(){sun.shadow.map?.dispose();sun.shadow.mapPass?.dispose();}};
}
