import * as THREE from 'three';
import { MeshStandardNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import { color, mix, positionWorld, sin, uniform, uv } from 'three/tsl';
import { prepareCinematicRoad } from './cinematic-road';
import type { Quality } from './world';

/** Translate Valley's GLSL water to native nodes; share bounded daylight and shadows. */
export function prepareCinematicValley(scene: THREE.Scene, renderer: WebGPURenderer, quality: Quality, camera: THREE.Camera, replaced: Set<THREE.Material>) {
  const time = uniform(0);
  const sky = scene.getObjectByName('alpine-sky') as THREE.Mesh | undefined;
  if (sky) { sky.removeFromParent(); sky.geometry.dispose(); replaced.add(sky.material as THREE.Material); }
  const river = scene.getObjectByName('flowing-river') as THREE.Mesh;
  const water = new MeshStandardNodeMaterial({roughness:.35, metalness:.15, side:THREE.DoubleSide});
  const p = uv(), wave = sin(p.y.mul(.20).add(time.mul(.8)).add(sin(p.x.mul(22)).mul(.8)));
  const edge = p.x.mul(2).sub(1).abs().pow(5);
  water.colorNode = mix(color(0x285e67),color(0x7daba6),edge.mul(.55).add(wave.mul(.08)).add(.12));
  replaced.add(river.material as THREE.Material); river.material = water;
  const land = scene.getObjectByName('alpine-terrain') as THREE.Mesh;
  const meadow = new MeshStandardNodeMaterial({vertexColors:true,roughness:1});
  const grain = sin(positionWorld.x.mul(.7)).mul(sin(positionWorld.z.mul(.9))).mul(.035).add(1);
  meadow.colorNode = color(0xffffff).mul(grain);
  replaced.add(land.material as THREE.Material); land.material = meadow;
  const daylight = prepareCinematicRoad(scene,renderer,quality,camera,replaced,true);
  return {update(view:THREE.Camera, elapsed:number, reduced:boolean, dt:number){time.value=reduced?0:elapsed;daylight.update(view,elapsed,reduced,dt);},dispose:daylight.dispose};
}
