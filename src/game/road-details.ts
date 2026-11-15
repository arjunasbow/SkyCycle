import * as THREE from 'three';
import type { Quality } from './world';
export type RoadDetailPut = (name:string, geo:THREE.BufferGeometry, material:THREE.Material, d:number, offset:number, y:number, sx:number, sy:number, sz:number, color?:number, tiltX?:number, tiltZ?:number) => void;
export const cinematicRoadBudget = {low:{trees:16,flowers:18,grass:35,terrain:26},medium:{trees:26,flowers:65,grass:85,terrain:38},high:{trees:38,flowers:120,grass:150,terrain:48}};
/** Shared assets and fixed per-chunk instance batches; no live mesh allocation. */
export function roadDetails(quality:Quality) {
  const budget=cinematicRoadBudget[quality], mat=(color:number)=>new THREE.MeshLambertMaterial({color});
  const box=new THREE.BoxGeometry(1,1,1), trunk=new THREE.CylinderGeometry(.7,1,1,quality==='low'?8:12);
  const crown=new THREE.SphereGeometry(1,quality==='low'?12:20,quality==='low'?10:14), pebble=new THREE.IcosahedronGeometry(1,1);
  // One connected, asymmetrical foliage mass: no separate elevated side lobes.
  const foliage=crown.getAttribute('position');
  for(let i=0;i<foliage.count;i++){
    const x=foliage.getX(i),y=foliage.getY(i),z=foliage.getZ(i);
    const r=1+.075*Math.sin(x*5+z*3)+.045*Math.sin(y*7-z*4);
    foliage.setXYZ(i,x*r*(1+.035*y),y*r,z*r);
  }
  crown.computeVertexNormals();
  const pine=new THREE.LatheGeometry([new THREE.Vector2(0,0),new THREE.Vector2(.65,.04),new THREE.Vector2(.25,.27),new THREE.Vector2(.52,.23),new THREE.Vector2(.17,.5),new THREE.Vector2(.4,.43),new THREE.Vector2(.1,.75),new THREE.Vector2(.26,.68),new THREE.Vector2(0,1.13)],quality==='low'?10:16);
  const green=mat(0xffffff), bark=mat(0x655542), plaster=mat(0xffffff), timber=mat(0x675345), roof=mat(0x875e50), stone=mat(0x8e9899), cream=mat(0xdcd6bb), glass=mat(0x45616a), dark=mat(0x34464c);
  const gableShape=new THREE.Shape();gableShape.moveTo(-.5,0);gableShape.lineTo(0,.6);gableShape.lineTo(.5,0);gableShape.closePath();
  const gable=new THREE.ExtrudeGeometry(gableShape,{depth:1,bevelEnabled:false});gable.translate(0,0,-.5);
  const grassGeometry=new THREE.BufferGeometry();grassGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.3,0,0,0,1,0,.3,0,0,0,0,-.3,0,.8,0,0,0,.3],3));grassGeometry.computeVertexNormals();
  const grassMaterial=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});
  const flowerShape=new THREE.Shape();for(let i=0;i<=40;i++){const a=i/40*Math.PI*2,r=.65+.24*Math.cos(a*5),x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)flowerShape.moveTo(x,y);else flowerShape.lineTo(x,y);}flowerShape.closePath();
  const flower=new THREE.ShapeGeometry(flowerShape,2);flower.rotateX(-Math.PI/2);
  const flowerMaterial=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});
  const archShape=new THREE.Shape();archShape.moveTo(-27,0);archShape.lineTo(27,0);archShape.lineTo(27,-6.5);archShape.lineTo(12,-6.5);archShape.lineTo(12,-4.5);archShape.quadraticCurveTo(0,2,-12,-4.5);archShape.lineTo(-12,-6.5);archShape.lineTo(-27,-6.5);archShape.closePath();
  const arch=new THREE.ExtrudeGeometry(archShape,{depth:1,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.06,bevelThickness:.06,curveSegments:quality==='low'?12:24});arch.rotateY(Math.PI/2);arch.translate(-.5,0,0);
  const waterMaterial=new THREE.MeshStandardMaterial({color:0x4f929b,roughness:.28,metalness:.12});waterMaterial.name='cinematic-stream-water';
  return {decorate(chunk:number,start:number,put:RoadDetailPut,random:()=>number,terrain:(offset:number,d:number)=>number,height:(d:number)=>number){
    for(let i=0;i<budget.trees;i++){
      const d=start+random()*200,side=i%2?-1:1,offset=side*(12+random()*(chunk%4===0?55:26)),h=9+random()*12,y=terrain(offset,d),conifer=i%3!==0;
      put('tree-trunks',trunk,bark,d,offset,y+h*.25,.47,h*.5,.47);
      const palette=[0x3f6450,0x6d8750,0x507563,0x88925a];
      if(conifer)put('conifers',pine,green,d,offset,y+h*.16,h*.31,h,h*.31,palette[i%4]);
      else {
        put('broadleaf-canopy',crown,green,d,offset,y+h*.69,h*.37,h*.38,h*.34,palette[i%4]);
        for(const branch of [-1,1])put('tree-branches',trunk,bark,d,offset+branch*h*.11,y+h*.46,.18,h*.38,.18,0xffffff,0,branch*.55);
      }
      if(i%2===0){const bd=d+3,bo=side*(13+random()*4);put('bushes',crown,green,bd,bo,terrain(bo,bd)+.7,1.3,1.2,1.8,0x758c54);}
    }
    for(let i=0;i<budget.grass;i++){const d=start+random()*200,offset=(i%2?-1:1)*(7.5+random()*4);put('detail-grass',grassGeometry,grassMaterial,d,offset,terrain(offset,d),.5+random()*.5,.4+random()*.6,.5,[0x6c8550,0x869955,0x9ca66c][i%3]);}
    for(let i=0;i<budget.flowers;i++){
      const d=start+random()*200,offset=(i%2?-1:1)*(7.8+random()*2.5),y=terrain(offset,d);
      put('detail-flower-stems',trunk,green,d,offset,y+.26,.035,.55,.035,0x64814e);
      put('detail-flower-heads',flower,flowerMaterial,d,offset,y+.55,.26,.26,.26,[0xe5c574,0xd7bdcb,0xe7dfbf,0xa7b5cf][i%4]);
      put('detail-flower-pollen',pebble,cream,d,offset,y+.58,.075,.05,.075);
    }
    if(chunk%3===0){
      for(let side=-1;side<=1;side+=2){const d=start+105,offset=side*48;put('meadow-field',box,plaster,d,offset,height(d)-.02,52,.04,150,[0x9da969,0xb2ab77,0x7e9864][chunk%3]);
        for(let j=0;j<20;j++){const rd=start+25+j*7.5;put('crop-rows',box,green,rd,offset,height(rd)+.12,49,.22,.65,0x74864f);}
      }
    }
    if([2,7,10].includes(chunk))for(let i=0;i<(quality==='low'?4:7);i++){
      const d=start+20+i*24,offset=i%2?-30:33,y=terrain(offset,d),s=6.5+i%3*.7,front=d-s*.57;
      put('chalet-foundations',box,stone,d,offset,y+.3,s*1.5,.7,s*1.2);
      put('chalets',box,plaster,d,offset,y+s*.5,s*1.4,s,s,[0xd6c9ad,0xc6ccbd,0xcab5a2][i%3]);
      put('chalet-roofs',gable,roof,d,offset,y+s,s*1.75,s*.7,s*1.4);
      for(let j=0;j<8;j++)for(const side of [-1,1])put('roof-tile-lines',box,timber,d-s*.62+j*s*.175,offset+side*s*.4375,y+s*1.21+.025,s*.97,.035,.04,0xffffff,0,-side*Math.atan(.42/.875));
      put('roof-ridges',box,timber,d,offset,y+s*1.42,.18,.16,s*1.45);
      put('house-doors',box,dark,front-.03,offset,y+s*.22,1.05,s*.44,.13);
      for(const floor of [.43,.78])for(const dx of [-s*.43,s*.43]){
        put('window-frames',box,cream,front,offset+dx,y+s*floor,1.45,1.6,.16);
        put('window-glass',box,glass,front-.10,offset+dx,y+s*floor,1.15,1.3,.13);
        put('window-crossbars',box,cream,front-.18,offset+dx,y+s*floor,.07,1.3,.08);
        put('window-crossbars',box,cream,front-.18,offset+dx,y+s*floor,1.15,.07,.08);
        for(const sign of [-1,1])put('window-shutters',box,timber,front-.06,offset+dx+sign*.91,y+s*floor,.32,1.6,.14);
      }
      for(const h of [.18,.63,.96])put('chalet-timber',box,timber,front-.12,offset,y+s*h,s*1.42,.13,.16);
      for(const dx of [-s*.67,0,s*.67])put('chalet-uprights',box,timber,front-.13,offset+dx,y+s*.66,.13,s*.64,.17);
      put('balcony-decks',box,timber,front-.75,offset,y+s*.62,s*1.48,.18,1.7);
      put('balcony-rails',box,timber,front-1.5,offset,y+s*.62+.9,s*1.5,.12,.13);
      for(let j=0;j<9;j++)put('balcony-balusters',box,timber,front-1.5,offset-s*.65+j*s*.1625,y+s*.62+.45,.075,.9,.075);
      put('flower-boxes',box,timber,front-1.62,offset,y+s*.62+.4,s*.7,.24,.3);
      for(let j=0;j<6;j++)put('detail-window-flowers',pebble,flowerMaterial,front-1.64,offset-s*.28+j*s*.11,y+s*.62+.62,.18,.14,.17,[0xc97881,0xcdb4d2,0xd5bc71][j%3]);
      put('chimneys',box,stone,d,offset+s*.3,y+s*1.34,.8,2.5,.9);put('chimney-caps',box,dark,d,offset+s*.3,y+s*1.34+1.3,1.1,.18,1.2);
      put('garden-paths',box,stone,d,offset/2,y+.07,Math.abs(offset)-10,.08,1.5);
      put('mailbox-posts',trunk,timber,d,Math.sign(offset)*10.8,height(d)+.6,.12,1.2,.12);put('mailboxes',box,dark,d,Math.sign(offset)*10.8,height(d)+1.25,.55,.4,.65);
    }
    if(chunk===7){const d=start+178,offset=82,y=terrain(offset,d);put('village-tower',box,plaster,d,offset,y+12,7,24,7,0xc9bda5);put('tower-roof',pine,dark,d,offset,y+24,6,10,6);put('tower-belfry',box,dark,d-3.55,offset,y+19,2.6,3,.12);put('tower-trim',box,cream,d,offset,y+15,7.4,.4,7.4);}
    if(chunk===5){
      put('cinematic-stream',box,waterMaterial,1100,0,height(1100)-2.6,420,.12,24);
      for(const side of [-1,1]){
        put('bridge-arches',arch,stone,1100,side*7.6,height(1100)-.1,1,1,1);
        for(let i=0;i<18;i++){const d=1074+i*3;put('bridge-stone',box,stone,d,side*7.6,height(d)+.5,.8,1.15,2.95);put('bridge-cap',box,cream,d,side*7.6,height(d)+1.13,1.05,.20,3.02);put('bridge-mortar',box,dark,d+1.48,side*7.14,height(d)+.45,.015,1.05,.035);}
        for(let i=0;i<12;i++){const d=1088+i*2.2,offset=side*(13+random()*20);put('riverbank-reeds',grassGeometry,grassMaterial,d,offset,height(d)-1.5,.5,1.5,.5,0x819465);}
        // Preserve downstream artwork placement while removing the old river stones.
        for(let i=0;i<5;i++)random();
      }
    }
  }};
}
