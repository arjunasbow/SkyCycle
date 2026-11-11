import * as THREE from 'three';
import { createCourse, type Target } from './flight';
export type Quality = 'low' | 'medium' | 'high';
export const riverX = (z: number) => -105 + Math.sin(z * .0034) * 65;
export function terrainHeight(x: number, z: number) {
  const d = Math.abs(x - riverX(z));
  return Math.max(-2, (Math.sin(x * .017 + z * .003) * 6 + Math.cos(z * .011) * 4) * Math.min(1, d / 90) + Math.max(0, d - 220) * .2 - 2);
}
const colors = { ground: 0x96af7c, tree: 0x466e55, trunk: 0x716b4d, water: 0x62aaa3, roof: 0xbc7054, cream: 0xece1bb, gold: 0xf5b54b };
export interface World { scene: THREE.Scene; bike: THREE.Group; propeller: THREE.Group; wheels: THREE.Mesh[]; targets: Target[]; targetObjects: THREE.Object3D[]; update: (time: number, thrust: number, dt: number) => void; resetTargets: () => void; dispose: () => void; }
export function createWorld(quality: Quality): World {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xc6dcd3); scene.fog = new THREE.Fog(0xc6dcd3, 220, quality === 'low' ? 1050 : 1550);
  scene.add(new THREE.HemisphereLight(0xfff2dc, 0x68816a, 2.4));
  const sun = new THREE.DirectionalLight(0xffe6bd, 2.6); sun.position.set(-350, 600, 160); scene.add(sun);
  const material = (color: number, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  const groundMat = material(colors.ground), treeMat = material(colors.tree), trunkMat = material(colors.trunk), roofMat = material(colors.roof), creamMat = material(colors.cream), goldMat = material(colors.gold), rockMat = material(0x8d9b88);
  const box = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 5), sphere = new THREE.IcosahedronGeometry(1, 1);
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, parent: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
  };
  const terrain = new THREE.PlaneGeometry(1500, 3100, quality === 'low' ? 55 : 90, quality === 'low' ? 90 : 150); terrain.rotateX(-Math.PI / 2); terrain.translate(0, 0, -1200);
  const pos = terrain.getAttribute('position'); const vertexColors = [];
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), h = terrainHeight(x, z); pos.setY(i, h); const c = new THREE.Color(colors.ground); c.offsetHSL(.015 * Math.sin(z), -.02, Math.sin(x * .03 + z * .02) * .025); vertexColors.push(c.r, c.g, c.b); }
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3)); terrain.computeVertexNormals();
  mesh(terrain, material(0xffffff, { vertexColors: true }), 0, 0, 0);
  const waterVertices: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 160; i++) { const z = 350 - i * 20, x = riverX(z); waterVertices.push(x - 24, .15, z, x + 24, .15, z); if (i < 160) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const water = new THREE.BufferGeometry(); water.setAttribute('position', new THREE.Float32BufferAttribute(waterVertices, 3)); water.setIndex(indices); water.computeVertexNormals();
  const waterMat = material(colors.water, { side: THREE.DoubleSide }); mesh(water, waterMat, 0, 0, 0);
  // Deterministic procedural artwork: no external asset downloads or textures.
  let seed = 57; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const dummy = new THREE.Object3D();
  const count = quality === 'low' ? 260 : quality === 'medium' ? 480 : 740;
  const trees = new THREE.InstancedMesh(cone, treeMat, count), trunks = new THREE.InstancedMesh(box, trunkMat, count); let index = 0;
  while (index < count) {
    const x = (random() - .5) * 1250, z = 300 - random() * 2950; if (Math.abs(x - riverX(z)) < 36 || Math.abs(x) < 35) continue;
    const size = 5 + random() * 8, y = terrainHeight(x, z);
    dummy.position.set(x, y + size * .8, z); dummy.rotation.set(0, random() * 6, 0); dummy.scale.set(size * .43, size * 1.4, size * .43); dummy.updateMatrix(); trees.setMatrixAt(index, dummy.matrix);
    dummy.position.y = y + size * .22; dummy.scale.set(.8, size * .6, .8); dummy.updateMatrix(); trunks.setMatrixAt(index++, dummy.matrix);
  }
  scene.add(trees, trunks);
  const mountains = new THREE.InstancedMesh(cone, rockMat, 72);
  for (let i = 0; i < 72; i++) {
    const side = i % 2 ? -1 : 1, z = 350 - Math.floor(i / 2) * 88, x = side * (490 + random() * 180), h = 110 + random() * 180;
    dummy.position.set(x, h * .38, z); dummy.rotation.set(0, random() * 6, 0); dummy.scale.set(110 + random() * 110, h, 100 + random() * 80); dummy.updateMatrix(); mountains.setMatrixAt(i, dummy.matrix);
    if (i % 3 === 0) mesh(cone, creamMat, x, h * .88, z, 30, h * .23, 28);
  } scene.add(mountains);
  for (let i = 0; i < 5; i++) {
    const z = -180 - i * 490, bridgeX = riverX(z);
    mesh(box, material(0xb0a183), bridgeX, 6, z, 70, 2, 10);
    for (const dz of [-5, 5]) { mesh(box, creamMat, bridgeX, 9, z + dz, 72, .8, .7); for (let j = -3; j <= 3; j++) mesh(box, creamMat, bridgeX + j * 11, 7.5, z + dz, .7, 4, .7); }
    for (const dx of [-20, 20]) mesh(box, rockMat, bridgeX + dx, 1, z, 5, 12, 12);
    for (let j = 0; j < 9; j++) {
      const x = 110 + random() * 110, hz = z + (random() - .5) * 160, y = terrainHeight(x, hz), scale = 6 + random() * 5;
      mesh(box, creamMat, x, y + scale * .45, hz, scale, scale * .9, scale * 1.2);
      const roof = mesh(cone, roofMat, x, y + scale * 1.2, hz, scale * .85, scale * .7, scale); roof.rotation.y = Math.PI / 4;
      mesh(box, treeMat, x, y + scale * .5, hz + scale * .61, scale * .2, scale * .35, .1);
    }
  }
  const clouds = new THREE.Group(); scene.add(clouds); const cloudMat = material(0xf5f0d9);
  for (let i = 0; i < 24; i++) { const x = (random() - .5) * 1700, y = 200 + random() * 130, z = 400 - random() * 3100; for (let j = 0; j < 3; j++) mesh(sphere, cloudMat, x + j * 20, y + (j === 1 ? 6 : 0), z, 28, 12 + random() * 9, 15); }
  const targets = createCourse(), targetObjects: THREE.Object3D[] = [];
  const ringGeo = new THREE.TorusGeometry(6.5, .45, 6, quality === 'low' ? 24 : 40);
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i], { x, y, z } = target;
    const group = new THREE.Group(); group.position.set(x, y, z); scene.add(group); targetObjects.push(group);
    if (target.kind === 'ring') {
      mesh(ringGeo, goldMat, 0, 0, 0, 1, 1, 1, group);
      for (let j = 0; j < 4; j++) { const angle = j * Math.PI / 2; mesh(sphere, creamMat, Math.sin(angle) * 6.5, Math.cos(angle) * 6.5, 0, .65, .65, .65, group); }
    } else {
      const balloonMat = material(i % 2 ? 0xe39668 : 0xd6b55c);
      mesh(sphere, balloonMat, 0, 3, 0, 7, 9, 7, group); mesh(box, trunkMat, 0, -9, 0, 3.5, 2.5, 3.5, group);
      for (const dx of [-1.5, 1.5]) mesh(box, creamMat, dx, -6.5, 0, .12, 5, .12, group);
    }
  }
  // Decorative hot-air balloons further from the flight path.
  for (let i = 0; i < 6; i++) { const x = (i % 2 ? -1 : 1) * (180 + random() * 100), y = 85 + random() * 60, z = -200 - i * 390; mesh(sphere, material(i % 2 ? 0xd89c74 : 0xe4cc8d), x, y, z, 13, 17, 13); mesh(box, trunkMat, x, y - 22, z, 5, 4, 5); }
  const bike = new THREE.Group(); bike.scale.setScalar(2); scene.add(bike);
  const dark = material(0x294b43), metal = material(0xe8d9b1), orange = material(0xdf8459);
  const wheelGeo = new THREE.TorusGeometry(.65, .055, 6, 24), wheels: THREE.Mesh[] = [];
  for (const z of [-.95, .95]) { const wheel = mesh(wheelGeo, dark, 0, .72, z, 1, 1, 1, bike); wheel.rotation.y = Math.PI / 2; wheels.push(wheel); }
  function tube(a: number[], b: number[], radius: number, mat: THREE.Material, parent = bike) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), d = end.clone().sub(start);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 6), mat); m.position.copy(start.add(end).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); parent.add(m);
  }
  for (const [a, b] of [[[0, .72, .95], [0, 1.65, .35]], [[0, 1.65, .35], [0, .72, -.05]], [[0, .72, -.05], [0, .72, .95]], [[0, .72, -.05], [0, 1.6, -.85]], [[0, 1.65, .35], [0, 1.6, -.85]], [[0, 1.8, -.9], [0, .72, -.95]]]) tube(a, b, .065, orange);
  mesh(box, dark, 0, 1.8, .37, .5, .12, .55, bike); tube([-.45, 1.94, -.85], [.45, 1.94, -.85], .05, metal);
  // Stylized rider: cream helmet, jacket and articulated legs.
  mesh(sphere, creamMat, 0, 2.85, -.15, .32, .35, .34, bike); tube([0, 1.9, .3], [0, 2.55, -.05], .24, treeMat);
  for (const side of [-1, 1]) { tube([side * .2, 2.5, -.05], [side * .4, 1.95, -.85], .08, creamMat); tube([side * .18, 1.92, .3], [side * .23, 1.35, -.1], .1, dark); tube([side * .23, 1.35, -.1], [side * .25, .8, 0], .08, creamMat); }
  tube([0, 1.5, -.85], [0, 1.5, -1.85], .1, metal); const propeller = new THREE.Group(); propeller.position.set(0, 1.5, -1.9); bike.add(propeller);
  mesh(box, metal, 0, 0, 0, 2.4, .14, .12, propeller); mesh(sphere, orange, 0, 0, -.1, .18, .18, .2, propeller);
  const resetTargets = () => { targets.forEach((t, i) => { t.hit = false; targetObjects[i].visible = true; }); };
  return {
    scene, bike, propeller, wheels, targets, targetObjects, resetTargets,
    update(time, thrust, dt) { propeller.rotation.z += dt * (thrust * 38 + 1); wheels.forEach(w => { w.rotation.z += dt * thrust * 6; }); targets.forEach((t, i) => { targetObjects[i].visible = !t.hit; if (t.kind === 'balloon') targetObjects[i].rotation.y = Math.sin(time * .5) * .1; }); waterMat.color.setHSL(.48, .27, .53 + Math.sin(time * .5) * .008); },
    dispose() { const geometries = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(); scene.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); if (o instanceof THREE.InstancedMesh) o.dispose(); } }); geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); scene.clear(); }
  };
}
