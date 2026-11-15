import * as THREE from 'three';
import type { Quality } from './world';
/** A botanical seed pod and crown which part radially into a safe central passage. */
export function addLotusHeart(lotus: THREE.Group, quality: Quality, petalGeometry: THREE.BufferGeometry) {
  const root = new THREE.Group(); root.name = 'lotus-botanical-heart'; lotus.add(root);
  const segments = quality === 'low' ? 48 : 80, rows = 5;
  const positions = new Float32Array((segments + 1) * (rows + 1) * 3), indices: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < segments; i++) { const n = j * (segments + 1) + i; indices.push(n, n + 1, n + segments + 1, n + 1, n + segments + 2, n + segments + 1); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)); geometry.setIndex(indices);
  const pod = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0xaaa24b, side: THREE.DoubleSide })); pod.name = 'lotus-seed-pod'; root.add(pod);
  const seedCount = quality === 'low' ? 55 : 95, stamenCount = quality === 'low' ? 64 : 112;
  const sphere = new THREE.SphereGeometry(1, 10, 8);
  const seeds = new THREE.InstancedMesh(sphere, new THREE.MeshLambertMaterial({ color: 0x526137 }), seedCount); seeds.name = 'lotus-seed-pits'; root.add(seeds);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshLambertMaterial({ color: 0xd7c794 }), stamenCount); stems.name = 'lotus-stamens'; root.add(stems);
  const tips = new THREE.InstancedMesh(sphere, new THREE.MeshLambertMaterial({ color: 0xd2ad4b }), stamenCount); tips.name = 'lotus-pollen-tips'; root.add(tips);
  const crown = new THREE.InstancedMesh(petalGeometry, new THREE.MeshLambertMaterial({ color: 0xe5a2bb, side: THREE.DoubleSide }), quality === 'low' ? 20 : 32); crown.name = 'lotus-inner-petal-crown'; root.add(crown);
  const dummy = new THREE.Object3D(); let previous = NaN;
  return { update(distanceTo: number, opening: number) {
    // The seed head is readable at a distance; its heart opens before the rider reaches it.
    const aperture = .35 + THREE.MathUtils.smoothstep(180 - distanceTo, 0, 140) * 18.65;
    if (Math.abs(previous - aperture) < .001 && root.userData.opening === opening) return;
    previous = aperture; root.userData.aperture = aperture; root.userData.opening = opening;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= segments; i++) {
      const r = aperture + (24 - aperture) * j / rows, a = i / segments * Math.PI * 2, k = (j * (segments + 1) + i) * 3;
      positions[k] = Math.cos(a) * r; positions[k + 1] = Math.sin(a) * r; positions[k + 2] = 2 + (1 - r * r / 576) * 2;
    }
    geometry.attributes.position.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    for (let i = 0; i < seedCount; i++) {
      const t = (i + .5) / seedCount, r = aperture + .6 + (23 - aperture - .6) * Math.sqrt(t), a = i * 2.39996323;
      dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, 2.4 + (1 - r * r / 576) * 2); dummy.rotation.set(0, 0, a); dummy.scale.set(.55, .7, .18); dummy.updateMatrix(); seeds.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < stamenCount; i++) {
      const a = i / stamenCount * Math.PI * 2, r = 24 + (i % 3) * .6, length = 2.4 + Math.sin(i * 7) * .7;
      dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, 2 + length / 2); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.scale.set(.085, length, .085); dummy.updateMatrix(); stems.setMatrixAt(i, dummy.matrix);
      dummy.position.z = 2 + length; dummy.rotation.set(0, 0, a); dummy.scale.set(.35, .55, .4); dummy.updateMatrix(); tips.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < crown.count; i++) {
      const a = i / crown.count * Math.PI * 2, r = 14 + opening * 10;
      dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, 2 + i % 2); dummy.rotation.set(.18, 0, a - Math.PI / 2);
      dummy.scale.set(i % 2 ? 2.9 : 3.6, i % 2 ? 7 : 9, 3); dummy.updateMatrix(); crown.setMatrixAt(i, dummy.matrix);
    }
    for (const batch of [seeds, stems, tips, crown]) batch.instanceMatrix.needsUpdate = true;
  } };
}
