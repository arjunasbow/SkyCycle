import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Quality } from './world';
import type { ValleyCompanionState } from './valley-companion';

/** Reused smooth geometry, feather groups and two fixed distant airships. */
export function addValleyWildlife(scene: THREE.Scene, quality: Quality) {
  const bird = new THREE.Group(); bird.name = 'valley-curious-bird'; bird.visible = false; scene.add(bird);
  const segments = quality === 'low' ? 10 : 16;
  const sphere = new THREE.SphereGeometry(1, segments, 10), cone = new THREE.ConeGeometry(1, 1, 8);
  const brown = new THREE.MeshLambertMaterial({ color: 0x6f6759 }), cream = new THREE.MeshLambertMaterial({ color: 0xc9ba9b });
  const rust = new THREE.MeshLambertMaterial({ color: 0xc57346 }), dark = new THREE.MeshLambertMaterial({ color: 0x292d2b });
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  };
  part(bird, sphere, brown, 0, 0, 0, .38, .38, .8);
  part(bird, sphere, cream, 0, -.13, -.12, .32, .29, .59);
  part(bird, sphere, brown, 0, .28, -.57, .31, .31, .34);
  part(bird, sphere, rust, 0, .14, -.78, .25, .24, .13);
  const beak = part(bird, cone, dark, 0, .26, -.99, .075, .27, .075); beak.rotation.x = -Math.PI / 2;
  for (const side of [-1, 1]) {
    part(bird, sphere, dark, side * .267, .36, -.72, .047, .047, .047);
    part(bird, sphere, cream, side * .29, .38, -.735, .012, .012, .012);
  }
  const wings = [-1, 1].map(side => {
    const wing = new THREE.Group(); wing.position.set(side * .24, .05, -.1); bird.add(wing);
    const count = quality === 'low' ? 6 : 9;
    for (let i = 0; i < count; i++) {
      const f = i / (count - 1), feather = part(wing, sphere, i % 3 ? brown : cream, side * (.24 + f * .82), -.04 * f, .10 + f * .32, .20 - f * .085, .04, .55 - f * .17);
      feather.rotation.y = side * (.25 + f * .45);
    }
    return wing;
  });
  for (let i = -2; i <= 2; i++) { const feather = part(bird, sphere, brown, i * .09, -.03, .91, .095, .035, .48); feather.rotation.y = i * .07; }
  bird.traverse(object => { object.frustumCulled = false; });
  const ships = new THREE.Group(); ships.name = 'valley-zeppelins'; scene.add(ships);
  const hull = new THREE.MeshStandardMaterial({ color: 0xc1c5ba, roughness: .7, metalness: .12 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x596e70 }), glass = new THREE.MeshLambertMaterial({ color: 0x374f5c });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 2; i++) {
    const ship = new THREE.Group(); ship.name = `valley-zeppelin-${i}`; ship.position.set(i ? 390 : -360, i ? 245 : 185, i ? -1650 : -560); ship.rotation.y = i ? -.7 : .65; ships.add(ship);
    part(ship, sphere, hull, 0, 0, 0, 14, 14, 56);
    for (const z of [-34, -18, 0, 18, 34]) {
      const radius = 14 * Math.sqrt(1 - (z / 56) ** 2);
      const seam = new THREE.Mesh(new THREE.TorusGeometry(radius, .16, 4, 32), trim); seam.position.z = z; ship.add(seam);
    }
    part(ship, sphere, hull, 0, -15, -5, 3.2, 3.3, 11);
    for (const side of [-1, 1]) {
      part(ship, box, trim, side * 12, 0, 38, 18, 1, 16);
      part(ship, box, trim, 0, side * 12, 38, 1, 18, 16);
      for (let window = 0; window < 5; window++) part(ship, box, glass, side * 3.05, -15, -12 + window * 3, .16, 1.5, 1.9);
      part(ship, sphere, trim, side * 8, -11, 7, 1.5, 1.4, 4);
    }
  }
  // Merge static pieces by material; only the two wing pivots remain articulated.
  const oldGeometries = new Set<THREE.BufferGeometry>();
  for(const parent of [bird,...wings,...ships.children]){
    const batches = new Map<THREE.Material,THREE.Mesh[]>();
    for(const object of [...parent.children])if(object instanceof THREE.Mesh && !Array.isArray(object.material)){
      if(!batches.has(object.material))batches.set(object.material,[]);batches.get(object.material)!.push(object);
    }
    for(const [material,meshes] of batches){
      const pieces=meshes.map(mesh=>{mesh.updateMatrix();oldGeometries.add(mesh.geometry);return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
      const geometry=mergeGeometries(pieces);pieces.forEach(piece=>piece.dispose());
      if(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;meshes.forEach(piece=>parent.remove(piece));parent.add(mesh);}
    }
  }
  const retained=new Set<THREE.BufferGeometry>();scene.traverse(object=>{if(object instanceof THREE.Mesh)retained.add(object.geometry);});oldGeometries.forEach(geo=>{if(!retained.has(geo))geo.dispose();});
  let presence = 0, previousTime = 0;
  return { reset() { presence = 0; previousTime = 0; bird.visible = false; }, update(time: number, bike: THREE.Group, state: ValleyCompanionState, reduced: boolean) {
    if (time < previousTime || time === 0) presence = 0;
    const dt = Math.max(0, Math.min(.1, time - previousTime)); previousTime = time;
    presence = reduced ? (state.earned ? 1 : 0) : THREE.MathUtils.clamp(presence + dt * (state.earned ? .5 : -1), 0, 1);
    bird.visible = presence > .001;
    const away = 1 - THREE.MathUtils.smoothstep(presence, 0, 1), t = reduced ? 0 : time;
    const x = 4.4 + Math.sin(t * .7) * 1.5 + away * 25, z = -6 + Math.sin(t * .43) * 2 - away * 22;
    const heading = -bike.rotation.y;
    bird.position.set(bike.position.x + Math.cos(heading) * x - Math.sin(heading) * z, bike.position.y + 4.8 + Math.sin(t * 1.8) * .7 + Math.sin(t * .41) * .6 + away * 10, bike.position.z + Math.sin(heading) * x + Math.cos(heading) * z);
    bird.rotation.set(Math.cos(t * 1.8) * .09, -heading + Math.sin(t * .7) * .2, Math.cos(t * .7) * .16);
    const flap = reduced ? 0 : Math.sin(t * 14) * (.20 + .35 * Math.max(0, Math.sin(t * .9)));
    wings[0].rotation.z = -.12 + flap; wings[1].rotation.z = .12 - flap;
    ships.children.forEach((ship, i) => { ship.position.x = (i ? 390 : -360) + Math.sin(t * .018 + i) * 50; ship.rotation.z = Math.sin(t * .11 + i) * .015; });
  } };
}
