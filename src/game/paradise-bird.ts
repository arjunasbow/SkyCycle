import * as THREE from 'three';
import type { Quality } from './world';

/** Curved feather with a rounded cross-section and a shaded colour gradient. */
function featherGeometry(rows: number) {
  const positions: number[] = [], colours: number[] = [], indices: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, width = Math.pow(Math.sin(Math.PI * t), .7) * .5 + .002;
    for (let k = 0; k < 5; k++) {
      const u = (k - 2) / 2;
      positions.push(u * width, .13 * Math.sin(Math.PI * t) * (1 - u * u) - .07 * t * t, t);
      const shade = .5 + .4 * Math.sin(Math.PI * t) + .1 * (1 - Math.abs(u)); colours.push(shade * .85, shade, shade);
      if (j < rows && k < 4) { const n = j * 5 + k; indices.push(n, n + 5, n + 1, n + 1, n + 5, n + 6); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
export function addParadiseBird(scene: THREE.Scene, quality: Quality) {
  const bird = new THREE.Group(); bird.name = 'kaleidoscope-paradise-bird'; scene.add(bird);
  const segments = quality === 'low' ? 18 : 28;
  const sphere = new THREE.SphereGeometry(1, segments, 16), feather = featherGeometry(quality === 'low' ? 12 : 20);
  const gold = new THREE.MeshLambertMaterial({ color: 0xe9b753 }), turquoise = new THREE.MeshLambertMaterial({ color: 0x299f97 });
  const plumage = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
  const part = (material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(sphere, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); bird.add(mesh); return mesh;
  };
  part(turquoise, 0, 0, 0, .42, .42, 1.1).name = 'paradise-body';
  part(gold, 0, .28, -1, .35, .38, .43).name = 'paradise-head';
  const breast = new THREE.MeshLambertMaterial({ color: 0x473778 }); part(breast, 0, -.12, -.35, .35, .31, .63);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.115, .58, 16), gold); beak.rotation.x = -Math.PI / 2; beak.position.set(0, .24, -1.57); bird.add(beak);
  const eye = new THREE.MeshBasicMaterial({ color: 0x091424 });
  for (const side of [-1, 1]) part(eye, side * .29, .4, -1.17, .065, .065, .07);
  const dummy = new THREE.Object3D(), tint = new THREE.Color(), wings: THREE.Group[] = [];
  const feathers = quality === 'low' ? 8 : quality === 'medium' ? 11 : 14;
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.scale.x = side; wing.position.x = side * .18; wings.push(wing); bird.add(wing);
    const fan = new THREE.InstancedMesh(feather, plumage, feathers); fan.name = `paradise-wing-${side}`; wing.add(fan);
    for (let i = 0; i < feathers; i++) {
      const t = i / (feathers - 1);
      dummy.position.set(.1 + t * .7, .04 - t * .015, -.42 + t * .8); dummy.rotation.set(-.05, 1.35 - t * .65, -.04);
      dummy.scale.set(.65, 1, 3.1 - t * .65); dummy.updateMatrix(); fan.setMatrixAt(i, dummy.matrix);
      tint.setHSL(.12 + t * .65, .65, .48); fan.setColorAt(i, tint);
    }
  }
  const tail = new THREE.Group(); tail.name = 'paradise-tail'; bird.add(tail);
  const streamers = new THREE.InstancedMesh(feather, plumage, quality === 'low' ? 7 : 11); streamers.name = 'paradise-tail-feathers'; tail.add(streamers);
  for (let i = 0; i < streamers.count; i++) {
    const t = i / (streamers.count - 1), spread = t * 2 - 1;
    dummy.position.set(spread * .2, -.15, .72); dummy.rotation.set(-.02, spread * .24, 0);
    dummy.scale.set(.44, 1, 5.6 - Math.abs(spread) * 1.4); dummy.updateMatrix(); streamers.setMatrixAt(i, dummy.matrix);
    tint.setHSL(.46 + t * .35, .6, .44 + Math.sin(t * Math.PI) * .1); streamers.setColorAt(i, tint);
  }
  const crest = new THREE.InstancedMesh(feather, plumage, 5); crest.name = 'paradise-crest'; bird.add(crest);
  for (let i = 0; i < 5; i++) { dummy.position.set((i - 2) * .055, .53, -.91); dummy.rotation.set(-1.2, (i - 2) * .2, 0); dummy.scale.set(.17, .5, .6); dummy.updateMatrix(); crest.setMatrixAt(i, dummy.matrix); crest.setColorAt(i, tint.setHex(0xe7bb65)); }
  return { bird, wings, tail };
}
