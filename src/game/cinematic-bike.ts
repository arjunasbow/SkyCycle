import * as THREE from 'three';
import type { Quality } from './world';
import { addTunnelRider, createDetailedCyclingRig } from './tunnel-rider';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function mergeStaticParts(parent:THREE.Group,keep:(mesh:THREE.Mesh)=>boolean) {
  const groups=new Map<THREE.Material,THREE.Mesh[]>(),old=new Set<THREE.BufferGeometry>();
  for(const object of [...parent.children])if(object instanceof THREE.Mesh&&!Array.isArray(object.material)&&!keep(object)){
    if(!groups.has(object.material))groups.set(object.material,[]);groups.get(object.material)!.push(object);
  }
  for(const [material,meshes]of groups){
    const pieces=meshes.map(mesh=>{mesh.updateMatrix();old.add(mesh.geometry);return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
    const geometry=mergeGeometries(pieces);pieces.forEach(piece=>piece.dispose());if(!geometry)continue;
    const batch=new THREE.Mesh(geometry,material);batch.name='cinematic-static-details';batch.userData.parts=meshes.map(mesh=>mesh.name).filter(Boolean);meshes.forEach(mesh=>parent.remove(mesh));parent.add(batch);
  }
  const retained=new Set<THREE.BufferGeometry>();parent.traverse(object=>{if(object instanceof THREE.Mesh)retained.add(object.geometry);});old.forEach(geometry=>{if(!retained.has(geometry))geometry.dispose();});
}
/** Replace the unuploaded prototype bike with a shared, detailed road bicycle. */
export function upgradeRoadBike(bike: THREE.Group, quality: Quality) {
  const oldGeometry = new Set<THREE.BufferGeometry>(), oldMaterials = new Set<THREE.Material>();
  bike.traverse(object => { if (object instanceof THREE.Mesh) { oldGeometry.add(object.geometry); for (const mat of Array.isArray(object.material) ? object.material : [object.material]) oldMaterials.add(mat); } });
  bike.clear(); oldGeometry.forEach(g => g.dispose()); oldMaterials.forEach(m => m.dispose());
  bike.name = 'cinematic-player-bike';
  const detail = quality === 'low' ? 10 : 16;
  const carbon = new THREE.MeshStandardMaterial({ color: 0x294c58, roughness: .38, metalness: .32 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xaebabe, roughness: .3, metalness: .7 });
  const rubber = new THREE.MeshLambertMaterial({ color: 0x202830 });
  const accent = new THREE.MeshLambertMaterial({ color: 0x279c8a }); accent.name = 'team-accent';
  const sphere = new THREE.SphereGeometry(1, detail, 10), cylinder = new THREE.CylinderGeometry(1, 1, 1, detail);
  const start = new THREE.Vector3(), end = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0), delta = new THREE.Vector3();
  const tube = (a: number[], b: number[], radius: number, material: THREE.Material, parent: THREE.Object3D = bike) => {
    start.set(...a as [number, number, number]); end.set(...b as [number, number, number]); delta.copy(end).sub(start);
    const mesh = new THREE.Mesh(cylinder, material); mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.scale.set(radius, delta.length(), radius); mesh.quaternion.setFromUnitVectors(axis, delta.normalize()); parent.add(mesh); return mesh;
  };
  for (const [a, b] of [[[0,.72,.95],[0,1.65,.35]],[[0,1.65,.35],[0,.95,0]],[[0,.95,0],[0,.72,.95]],[[0,.95,0],[0,1.6,-.85]],[[0,1.65,.35],[0,1.6,-.85]],[[0,1.8,-.9],[0,.72,-.95]]]) tube(a,b,.045,carbon);
  tube([0,1.65,.35],[0,1.83,.35],.035,alloy);
  tube([0,1.59,.30],[0,1.56,-.7],.019,accent);
  for (const side of [-1,1]) {
    tube([side*.07,.95,0],[side*.07,.72,.95],.025,carbon);
    tube([side*.07,1.6,-.85],[side*.07,.72,-.95],.03,carbon);
    const drops = new THREE.CatmullRomCurve3([new THREE.Vector3(side*.40,1.96,-.83),new THREE.Vector3(side*.43,1.94,-1.02),new THREE.Vector3(side*.43,1.72,-1.05),new THREE.Vector3(side*.43,1.68,-.84)]);
    const handlebar = new THREE.Mesh(new THREE.TubeGeometry(drops,16,.035,6,false),rubber); handlebar.name='drop-handlebar'; bike.add(handlebar);
    tube([side*.41,1.91,-.94],[side*.41,1.79,-1.02],.015,alloy);
  }
  tube([-.4,1.96,-.83],[.4,1.96,-.83],.03,alloy);
  const saddle = new THREE.Mesh(sphere,rubber); saddle.name='road-saddle'; saddle.position.set(0,1.82,.32); saddle.scale.set(.23,.07,.34); bike.add(saddle);
  const rims: THREE.Mesh[] = [];
  const tireGeo = new THREE.TorusGeometry(.65,.042,detail,quality==='low'?40:64), rimGeo = new THREE.TorusGeometry(.60,.018,8,48);
  for (const z of [-.95,.95]) {
    const wheel = new THREE.Group(); wheel.name=z<0?'road-front-wheel':'road-rear-wheel'; wheel.position.set(0,.72,z); wheel.rotation.y=Math.PI/2; bike.add(wheel);
    const tire = new THREE.Mesh(tireGeo,rubber), rim = new THREE.Mesh(rimGeo,alloy); wheel.add(tire,rim); rims.push(rim);
    const spokes = new THREE.InstancedMesh(new THREE.CylinderGeometry(.006,.006,.58,4),alloy,quality==='low'?16:24); spokes.name='wheel-spokes'; wheel.add(spokes);
    const dummy = new THREE.Object3D();
    for(let i=0;i<spokes.count;i++){const a=i/spokes.count*Math.PI*2; dummy.position.set(Math.cos(a)*.30,Math.sin(a)*.30,0);dummy.rotation.set(0,0,a-Math.PI/2);dummy.updateMatrix();spokes.setMatrixAt(i,dummy.matrix);}
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.3,detail),alloy);hub.rotation.x=Math.PI/2;wheel.add(hub);
  }
  const chainring = new THREE.Mesh(new THREE.TorusGeometry(.18,.018,6,32),alloy);chainring.name='chainring';chainring.rotation.y=Math.PI/2;chainring.position.set(.23,.95,0);bike.add(chainring);
  for(let i=0;i<4;i++){const gear=new THREE.Mesh(new THREE.TorusGeometry(.08+i*.012,.008,4,24),alloy);gear.rotation.y=Math.PI/2;gear.position.set(.16+i*.022,.72,.95);bike.add(gear);}
  const chainCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(.25,1.12,0),new THREE.Vector3(.25,.83,.95),new THREE.Vector3(.25,.62,.95),new THREE.Vector3(.25,.78,0)],true);
  const chain=new THREE.Mesh(new THREE.TubeGeometry(chainCurve,40,.009,4,true),rubber);chain.name='bicycle-chain';bike.add(chain);
  const bottle=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.36,detail),accent);bottle.name='water-bottle';bottle.position.set(0,1.16,-.2);bottle.rotation.x=-.5;bike.add(bottle);
  const bottleCap=new THREE.Mesh(sphere,rubber);bottleCap.position.set(0,1.33,-.29);bottleCap.scale.set(.06,.04,.06);bike.add(bottleCap);
  const cable=new THREE.CatmullRomCurve3([new THREE.Vector3(.3,1.94,-.87),new THREE.Vector3(.16,1.6,-1),new THREE.Vector3(0,1.36,-.83)]);
  bike.add(new THREE.Mesh(new THREE.TubeGeometry(cable,16,.008,4,false),rubber));
  addTunnelRider(bike,quality);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,32),new THREE.MeshBasicMaterial({color:0x182c32,transparent:true,opacity:.16,depthWrite:false}));
  shadow.name='bike-contact-shadow';shadow.rotation.x=-Math.PI/2;shadow.position.set(0,.03,0);shadow.scale.set(.65,1.65,1);bike.add(shadow);
  bike.userData.components=['spoked-wheels','drop-handlebar','bicycle-chain','water-bottle','segmented-helmet'];
  const riderRoot=bike.getObjectByName('detailed-tunnel-rider') as THREE.Group;
  mergeStaticParts(riderRoot,mesh=>/^rider-(thigh|shin|knee|shoe|pedal|crank|helmet|torso)/.test(mesh.name));
  mergeStaticParts(bike,mesh=>mesh.name==='bike-contact-shadow'||mesh.name==='chainring');
  // Bring tyre contact and its small contact shadow down to the road surface.
  for(const child of bike.children)child.position.y-=.095;
  return rims;
}
export function createCinematicRaceRig(bike: THREE.Group) {
  const rider=createDetailedCyclingRig(bike), body=bike.getObjectByName('detailed-tunnel-rider')!;
  const wheels=[bike.getObjectByName('road-front-wheel')!,bike.getObjectByName('road-rear-wheel')!];let stance=0;
  return {update(distance:number,speed:number,sprint:boolean,dt=1/60){
    if(dt<=0)return;
    stance+=((sprint?1:0)-stance)*(1-Math.exp(-dt*4));body.rotation.x=-stance*.035;
    rider.setPhase(-distance*1.2);wheels.forEach(wheel=>{wheel.rotation.z=distance/(.65*bike.scale.x);});
    bike.userData.cadence=Math.max(0,Math.min(120,speed*1.2*60/(Math.PI*2)));
  }};
}
