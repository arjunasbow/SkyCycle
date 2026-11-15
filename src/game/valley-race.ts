import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import typeface from 'three/examples/fonts/helvetiker_regular.typeface.json';
import type { Quality } from './world';

export const VALLEY_RACE_LENGTH = 690;
/** A single transverse vignette: straight river crossing, then a winding hillside climb. */
export function valleyRacePlan(distance: number) {
  const x = -350 + THREE.MathUtils.clamp(distance, 0, VALLEY_RACE_LENGTH);
  const climb = THREE.MathUtils.clamp((x + 60) / 400, 0, 1);
  const z = x < -170 ? -850 + ((-170 - x) / 180) ** 2 * 90 : x <= -60 ? -850 : -850 - climb * 165 + Math.sin(climb * Math.PI * 2) * 16;
  return { x, z };
}
/** Keep woodland clear of the road and finish meadow without altering the collision surface. */
export function nearValleyRace(x: number, z: number, margin = 13) {
  if (x < -350 - margin || x > 340 + margin) return false;
  return Math.abs(z - valleyRacePlan(x + 350).z) < margin;
}
export function valleyRaceHeight(distance: number, floor: (x:number,z:number)=>number) {
  const {x,z} = valleyRacePlan(distance);
  const bridge = THREE.MathUtils.smoothstep(x,-190,-166) * (1-THREE.MathUtils.smoothstep(x,-66,-42));
  return Math.max(1.3, floor(x,z) + .5, 6 * bridge);
}

export function addValleyRace(scene: THREE.Scene, quality: Quality, floor: (x:number,z:number)=>number) {
  const root = new THREE.Group(); root.name = 'valley-race-below'; scene.add(root);
  const material = (color:number) => new THREE.MeshLambertMaterial({color});
  const asphalt=material(0x596366), edge=material(0xc5bd9c), stone=material(0x9b9e92), rail=material(0xddd5bd);
  const box=new THREE.BoxGeometry(1,1,1), cylinder=new THREE.CylinderGeometry(1,1,1,6), sphere=new THREE.SphereGeometry(1,quality==='low'?8:12,8);
  const dummy=new THREE.Object3D();
  type Batch={geometry:THREE.BufferGeometry;material:THREE.Material;matrices:THREE.Matrix4[]};
  const batches=new Map<string,Batch>();
  const put=(name:string,geometry:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number,rotation=0)=>{
    if(!batches.has(name))batches.set(name,{geometry,material:mat,matrices:[]});
    dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,rotation,0);dummy.updateMatrix();batches.get(name)!.matrices.push(dummy.matrix.clone());
  };
  const at=(distance:number,offset=0,lift=0)=>{
    const p=valleyRacePlan(distance),a=valleyRacePlan(distance-.5),b=valleyRacePlan(distance+.5);
    const angle=Math.atan2(b.z-a.z,b.x-a.x);
    return {x:p.x-Math.sin(angle)*offset,y:valleyRaceHeight(distance,floor)+lift,z:p.z+Math.cos(angle)*offset,angle};
  };
  // Five samples across the embankment match the existing ground; the bridge leaves the river open.
  const vertices:number[]=[],indices:number[]=[],segments=quality==='low'?160:240;
  for(let i=0;i<=segments;i++)for(const offset of [-9,-5.2,0,5.2,9]){
    const p=at(i/segments*VALLEY_RACE_LENGTH,offset);
    const y=Math.abs(offset)>8?floor(p.x,p.z)+.08:p.y-.12;
    vertices.push(p.x,y,p.z);
    if(i<segments&&offset!==9){const j=vertices.length/3-1;indices.push(j,j+1,j+5,j+1,j+6,j+5);}
  }
  // Omit bridge embankment triangles so water remains visible through the arch.
  const embankment=new THREE.BufferGeometry();embankment.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  embankment.setIndex(indices.filter((_,index)=>{const triangle=Math.floor(index/3),vertex=indices[triangle*3];const x=vertices[vertex*3];return x < -164 || x > -68;}));embankment.computeVertexNormals();
  const bank=new THREE.Mesh(embankment,edge);bank.name='valley-race-embankment';root.add(bank);
  const roadVertices:number[]=[],roadIndices:number[]=[];
  for(let i=0;i<=segments;i++){
    for(const offset of [-4.8,4.8]){const p=at(i/segments*VALLEY_RACE_LENGTH,offset,.04);roadVertices.push(p.x,p.y,p.z);}
    if(i<segments){const j=i*2;roadIndices.push(j,j+1,j+2,j+1,j+3,j+2);}
  }
  const roadGeometry=new THREE.BufferGeometry();roadGeometry.setAttribute('position',new THREE.Float32BufferAttribute(roadVertices,3));roadGeometry.setIndex(roadIndices);roadGeometry.computeVertexNormals();
  const road=new THREE.Mesh(roadGeometry,asphalt);road.name='valley-race-road';root.add(road);
  for(let d=6;d<VALLEY_RACE_LENGTH;d+=14){const p=at(d,0,.07);put('valley-race-centre-dashes',box,rail,p.x,p.y,p.z,4,.035,.16,-p.angle);}
  for(const side of [-1,1])for(let d=3;d<VALLEY_RACE_LENGTH;d+=9){const p=at(d,side*4.45,.065);put('valley-race-edge-lines',box,rail,p.x,p.y,p.z,8.9,.025,.13,-p.angle);}
  const bridge=new THREE.Shape();bridge.moveTo(-49,0);bridge.lineTo(49,0);bridge.lineTo(49,-7);bridge.lineTo(28,-7);bridge.quadraticCurveTo(0,2,-28,-7);bridge.lineTo(-49,-7);bridge.closePath();
  const arch=new THREE.ExtrudeGeometry(bridge,{depth:10.2,bevelEnabled:false,curveSegments:quality==='low'?16:24});arch.translate(0,0,-5.1);
  put('valley-race-bridge',arch,stone,-116,5.85,-850,1,1,1);
  for(const side of [-1,1]){
    put('valley-race-bridge-rails',box,rail,-116,7.3,-850+side*5.15,99,.28,.28);
    for(let x=-163;x<=-68;x+=7)put('valley-race-bridge-posts',box,stone,x,6.55,-850+side*5.15,.5,1.6,.5);
  }
  const finish=at(VALLEY_RACE_LENGTH-35),heading=-Math.PI/2-finish.angle;
  const banner=new THREE.Group();banner.name='valley-race-finish';banner.position.set(finish.x,finish.y,finish.z);banner.rotation.y=heading;root.add(banner);
  const part=(parent:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;};
  const ink=material(0x314850),paper=material(0xf1e6c9);
  for(const side of [-1,1])part(banner,cylinder,ink,side*6.1,3.6,0,.14,7.2,.14);
  part(banner,box,paper,0,6.5,0,12.2,1.6,.18);
  const font=new FontLoader().parse(typeface),letters=new THREE.ShapeGeometry(font.generateShapes('FINISH',.68),2);letters.computeBoundingBox();letters.translate(-(letters.boundingBox!.min.x+letters.boundingBox!.max.x)/2,6.25,.105);
  const lettering=new THREE.Mesh(letters,ink);banner.add(lettering);
  const back=lettering.clone();back.rotation.y=Math.PI;banner.add(back);
  for(let row=0;row<2;row++)for(let col=0;col<20;col++){const p=at(VALLEY_RACE_LENGTH-35+(row-.5)*.7,(col-9.5)*.46,.085);put('valley-race-chequered-line',box,(col+row)%2?ink:paper,p.x,p.y,p.z,.7,.025,.46,-p.angle);}
  for(const [name,batch] of batches){const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);mesh.name=name;batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();root.add(mesh);}

  // Small silhouettes at aerial distance: shared smooth shapes, six coloured jerseys, articulated legs.
  const tyre=material(0x293e42),skin=material(0xc4ac8e),helmet=material(0xe8debe);
  const wheelGeometry=new THREE.TorusGeometry(.64,.055,6,quality==='low'?16:24);
  const axis=new THREE.Vector3(0,1,0),start=new THREE.Vector3(),end=new THREE.Vector3(),delta=new THREE.Vector3();
  const link=(parent:THREE.Object3D,mat:THREE.Material,a:number[],b:number[],width:number)=>{
    start.set(...a as [number,number,number]);end.set(...b as [number,number,number]);delta.copy(end).sub(start);
    const mesh=part(parent,cylinder,mat,0,0,0,width,delta.length(),width);mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(axis,delta.normalize());return mesh;
  };
  const riders=Array.from({length:6},(_,i)=>{
    const bike=new THREE.Group();bike.name=`valley-mini-racer-${i}`;root.add(bike);
    const jersey=material([0xc66e50,0x468e8c,0xd0ad50,0x667fa6,0x9d7596,0x819c60][i]);
    for(const [a,b]of [[[0,.7,.9],[0,1.6,.3]],[[0,1.6,.3],[0,.95,0]],[[0,.95,0],[0,.7,.9]],[[0,.95,0],[0,1.6,-.85]],[[0,1.6,.3],[0,1.6,-.85]],[[0,1.8,-.9],[0,.7,-.95]]])link(bike,jersey,a,b,.045);
    const wheels=[-.95,.95].map(z=>{const wheel=part(bike,wheelGeometry,tyre,0,.7,z,1,1,1);wheel.rotation.y=Math.PI/2;return wheel;});
    part(bike,sphere,jersey,0,2.18,.05,.25,.48,.23).rotation.x=-.48;
    part(bike,sphere,skin,0,2.65,-.2,.23,.26,.24);part(bike,sphere,helmet,0,2.84,-.2,.28,.17,.3);
    part(bike,box,tyre,0,1.78,.33,.4,.1,.5);
    for(const side of [-1,1])link(bike,skin,[side*.2,2.38,-.07],[side*.4,1.94,-.84],.07);
    link(bike,tyre,[-.4,1.94,-.84],[.4,1.94,-.84],.04);
    const legs=[-1,1].map(side=>({side,thigh:link(bike,tyre,[side*.18,1.9,.3],[side*.23,1.4,-.2],.09),shin:link(bike,skin,[side*.23,1.4,-.2],[side*.25,.95,0],.065)}));
    // Merge rigid frame/body pieces by material; wheels and legs remain movable.
    const animated=new Set<THREE.Object3D>([...wheels,...legs.flatMap(leg=>[leg.thigh,leg.shin])]);
    const parts=new Map<THREE.Material,THREE.Mesh[]>();
    for(const object of [...bike.children])if(object instanceof THREE.Mesh&&!animated.has(object)){const mat=object.material as THREE.Material;if(!parts.has(mat))parts.set(mat,[]);parts.get(mat)!.push(object);}
    for(const [mat,meshes]of parts){const pieces=meshes.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});const geo=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());if(geo){meshes.forEach(mesh=>bike.remove(mesh));bike.add(new THREE.Mesh(geo,mat));}}
    return {bike,wheels,legs};
  });
  const hip=new THREE.Vector3(),knee=new THREE.Vector3(),foot=new THREE.Vector3(),v=new THREE.Vector3();
  const poseLink=(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3,width:number)=>{v.copy(b).sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.set(width,v.length(),width);mesh.quaternion.setFromUnitVectors(axis,v.normalize());};
  // Start the pack on the crossing during the normal flight approach, with an uphill breakaway.
  const update=(elapsed:number,reduced=false)=>{
    const time=reduced?0:elapsed;
    const raceTime=(time+18)%108;
    root.userData.raceTime=raceTime;
    for(let i=0;i<riders.length;i++){
      const rider=riders[i],breakaway=i===0?THREE.MathUtils.smoothstep(raceTime,40,80)*30:0;
      const rawDistance=raceTime*6.6+breakaway-Math.floor(i/2)*5.8;
      rider.bike.visible=rawDistance<VALLEY_RACE_LENGTH;
      const distance=THREE.MathUtils.clamp(rawDistance,1,VALLEY_RACE_LENGTH-1);
      const p=at(distance,(i%2?1:-1)*1.65),next=at(Math.min(VALLEY_RACE_LENGTH,distance+1));
      rider.bike.position.set(p.x,p.y+.08,p.z);rider.bike.rotation.set(Math.atan2(next.y-p.y,Math.hypot(next.x-p.x,next.z-p.z)),-Math.PI/2-p.angle,0,'YXZ');
      const phase=time*8.5+i*.7;
      rider.wheels.forEach(wheel=>{wheel.rotation.z=-distance/.64;});
      for(const leg of rider.legs){const angle=phase+(leg.side<0?0:Math.PI);hip.set(leg.side*.18,1.9,.3);foot.set(leg.side*.25,.95+Math.cos(angle)*.23,-Math.sin(angle)*.23);knee.set(leg.side*.23,1.4+Math.cos(angle)*.09,-.35-Math.sin(angle)*.12);poseLink(leg.thigh,hip,knee,.09);poseLink(leg.shin,knee,foot,.065);}
    }
    root.visible=true;
  };
  update(0);
  return {update};
}
