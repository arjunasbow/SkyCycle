import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { companionOffset } from './companion-motion';
import type { Quality } from './world';
import type { ValleyCompanionState } from './valley-companion';

export function addSputnik(scene:THREE.Scene,quality:Quality){
  const satellite=new THREE.Group();satellite.name='sputnik-companion';satellite.visible=false;scene.add(satellite);
  const shell=new THREE.MeshStandardMaterial({color:0xb8c8d1,metalness:.8,roughness:.28});
  const sphere=new THREE.SphereGeometry(.66,quality==='low'?20:32,20),body=new THREE.Mesh(sphere,shell);satellite.add(body);
  const alloy=new THREE.MeshStandardMaterial({color:0x8199ac,metalness:.65,roughness:.4});
  const seam=new THREE.Mesh(new THREE.TorusGeometry(.662,.014,5,48),alloy);seam.rotation.x=Math.PI/2;satellite.add(seam);
  const antennas:THREE.BufferGeometry[]=[];
  const axis=new THREE.Vector3(0,1,0);
  for(const side of [-1,1])for(const front of [-1,1]){
    const a=new THREE.Vector3(side*.35,-.38,front*.32),b=new THREE.Vector3(side*(front>0?1.7:1.4),-2.4,front*1.35),delta=b.clone().sub(a);
    const geo=new THREE.CylinderGeometry(.014,.025,delta.length(),6);geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis,delta.normalize()));geo.translate(...a.add(b).multiplyScalar(.5).toArray());antennas.push(geo);
  }
  const antennasGeo=mergeGeometries(antennas)!;antennas.forEach(g=>g.dispose());satellite.add(new THREE.Mesh(antennasGeo,alloy));
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(.045,8,6),new THREE.MeshBasicMaterial({color:0x88c9c4}));beacon.position.set(0,.65,0);satellite.add(beacon);
  satellite.traverse(object=>{object.frustumCulled=false;});
  const offset=new THREE.Vector3();let presence=0,previousTime=0;
  return {reset(){presence=0;previousTime=0;satellite.visible=false;},update(time:number,bike:THREE.Group,state:ValleyCompanionState,reduced:boolean){
    if(time<previousTime||time===0)presence=0;
    const dt=Math.max(0,Math.min(.1,time-previousTime));previousTime=time;
    presence=reduced?(state.earned?1:0):THREE.MathUtils.clamp(presence+dt*(state.earned?.5:-1),0,1);
    satellite.visible=presence>.001;
    const t=reduced?0:time;companionOffset(offset,presence,t,reduced,5.6);
    // Calm orbital drift rather than wingbeats; no flashing light or sound.
    offset.y+=reduced?0:Math.sin(t*.6)*.3;
    const heading=-bike.rotation.y;satellite.position.set(bike.position.x+Math.cos(heading)*offset.x-Math.sin(heading)*offset.z,bike.position.y+offset.y,bike.position.z+Math.sin(heading)*offset.x+Math.cos(heading)*offset.z);
    satellite.rotation.set(Math.sin(t*.4)*.13,t*.16,Math.sin(t*.32)*.17);
  }};
}
