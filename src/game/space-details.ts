import * as THREE from 'three';
import type { Quality } from './world';
const noise=(x:number,y:number,z:number)=>Math.sin(x*7+y*3+Math.sin(z*9))*Math.cos(y*8-z*4)*.5+Math.sin(x*19-z*13+y*11)*.18;
/** Original coloured surfaces, not fetched textures: smooth gas bands, oceans and crater relief. */
export function spacePlanetGeometry(index:number,quality:Quality){
  const geo=new THREE.SphereGeometry(1,quality==='low'?40:quality==='medium'?64:80,quality==='low'?24:48),positions=geo.getAttribute('position'),colours:number[]=[];
  const sea=new THREE.Color(0x285a83),land=new THREE.Color(0x659478),ice=new THREE.Color(0xc0d5cf),warm=new THREE.Color(0xc49677),pale=new THREE.Color(0xd7c4a0),violet=new THREE.Color(0x776ba9),teal=new THREE.Color(0x578e98),c=new THREE.Color();
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),n=noise(x,y,z);
    if(index===0){c.copy(sea).lerp(land,THREE.MathUtils.smoothstep(n,-.04,.14));c.lerp(ice,THREE.MathUtils.smoothstep(Math.abs(y)+n*.15,.8,.96));}
    else if(index===1){const bands=Math.sin(y*45+Math.sin(x*7+z*5)*1.3+n*3)*.5+.5;c.copy(warm).lerp(pale,bands*.8);const storm=Math.exp(-((x-.65)**2+(y+.15)**2+(z+.7)**2)*50);c.lerp(new THREE.Color(0xa56a50),storm*.8);}
    else if(index===2)c.copy(violet).lerp(pale,THREE.MathUtils.smoothstep(Math.sin(y*32+n*3),-.6,.9)*.28);
    else c.copy(teal).lerp(ice,THREE.MathUtils.smoothstep(Math.sin(y*25+n*3),.1,.95)*.38);
    c.multiplyScalar(.93+n*.12);colours.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));return geo;
}
export function spaceMoonGeometry(quality:Quality){
  const geo=new THREE.SphereGeometry(1,quality==='low'?32:64,quality==='low'?24:40),p=geo.getAttribute('position'),colours:number[]=[];
  const craters=Array.from({length:22},(_,i)=>{const y=1-2*(i+.5)/22,a=i*2.39996,r=Math.sqrt(1-y*y);return {x:Math.cos(a)*r,y,z:Math.sin(a)*r,radius:.09+(i%4)*.025};});
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);let relief=noise(x,y,z)*.012;
    for(const crater of craters){const d=Math.hypot(x-crater.x,y-crater.y,z-crater.z)/crater.radius;if(d<1)relief-=.035*(1-d*d);if(d<1.4)relief+=.013*Math.exp(-(((d-1)/.16)**2));}
    p.setXYZ(i,x*(1+relief),y*(1+relief),z*(1+relief));const c=new THREE.Color(0xa4acb3).multiplyScalar(.94+relief*2+noise(x*2,y*2,z*2)*.1);colours.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geo.computeVertexNormals();return geo;
}
export function spaceRingGeometry(){
  const geo=new THREE.RingGeometry(1.35,2.05,128,18),p=geo.getAttribute('position'),colours:number[]=[],index=geo.index!,indices:number[]=[];
  for(let i=0;i<p.count;i++){const r=Math.hypot(p.getX(i),p.getY(i)),c=new THREE.Color(0xb7afa0).lerp(new THREE.Color(0x746b85),.3+.25*Math.sin(r*120)+.15*Math.sin(r*47));colours.push(c.r,c.g,c.b);}
  for(let i=0;i<index.count;i+=3){let radius=0;for(let j=0;j<3;j++){const v=index.getX(i+j);radius+=Math.hypot(p.getX(v),p.getY(v))/3;}if(radius<1.71||radius>1.78)indices.push(index.getX(i),index.getX(i+1),index.getX(i+2));}
  geo.setIndex(indices);geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));return geo;
}
