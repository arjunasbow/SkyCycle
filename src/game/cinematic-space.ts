import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { color, float, normalView, positionViewDirection, sin, uv } from 'three/tsl';
/** Quiet native surfaces and rim-only atmospheres; no fullscreen light veil or shadow passes. */
export function prepareCinematicSpace(scene:THREE.Scene,replaced:Set<THREE.Material>){
  scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||Array.isArray(object.material))return;
    const original=object.material;
    if(object.name==='planet'){
      const mat=new MeshStandardNodeMaterial({color:0xffffff,vertexColors:true,roughness:.84});
      const p=uv(),grain=sin(p.x.mul(380)).mul(sin(p.y.mul(270))).mul(.018).add(1);
      mat.colorNode=color(0xffffff).mul(grain);object.material=mat;replaced.add(original);
    }else if(object.name==='planet-atmosphere'){
      const mat=new MeshBasicNodeMaterial({color:(original as THREE.MeshBasicMaterial).color,side:THREE.BackSide,transparent:true,depthWrite:false});
      mat.opacityNode=float(1).sub(normalView.dot(positionViewDirection).abs()).pow(3).mul(.19);
      object.material=mat;replaced.add(original);
    }
  });
  return {update(_camera:THREE.Camera,_time:number,_reduced:boolean,_dt:number){},dispose(){}};
}
