import * as THREE from 'three';
import { roadX, roadHeading, ROAD_LENGTH, type RaceState } from './race';

/** Low-cost road ribbon and original roadside scenery; all meshes are reused. */
export function addRoadScenery(scene: THREE.Scene) {
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 320; i++) {
    const distance = -240 + i * 10, z = 110 - distance, x = roadX(distance);
    positions.push(x - 7, .1, z, x + 7, .1, z);
    if (i < 320) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const road = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0x596571, side: THREE.DoubleSide })); road.name = 'race-road'; scene.add(road);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 3500), new THREE.MeshLambertMaterial({ color: 0x9bb680 })); ground.rotation.x = -Math.PI / 2; ground.position.z = -1200; scene.add(ground);
  const box = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 6);
  const cream = new THREE.MeshLambertMaterial({ color: 0xf9ebcd }), green = new THREE.MeshLambertMaterial({ color: 0x46735b }), rock = new THREE.MeshLambertMaterial({ color: 0x8e9e8c });
  const dummy = new THREE.Object3D(), dashes = new THREE.InstancedMesh(box, cream, 154), trees = new THREE.InstancedMesh(cone, green, 180), mountains = new THREE.InstancedMesh(cone, rock, 36);
  for (let i = 0; i < 154; i++) { const d = -220 + i * 20; dummy.position.set(roadX(d), .13, 110 - d); dummy.rotation.set(0, -roadHeading(d), 0); dummy.scale.set(.22, .025, 6); dummy.updateMatrix(); dashes.setMatrixAt(i, dummy.matrix); }
  for (let i = 0; i < 180; i++) { const d = -220 + i * 17, size = 6 + (i * 7 % 9); dummy.position.set(roadX(d) + (i % 2 ? -1 : 1) * (20 + i * 13 % 90), size / 2, 110 - d); dummy.rotation.set(0, i, 0); dummy.scale.set(size * .4, size, size * .4); dummy.updateMatrix(); trees.setMatrixAt(i, dummy.matrix); }
  for (let i = 0; i < 36; i++) { const height = 100 + i * 17 % 120; dummy.position.set((i % 2 ? -1 : 1) * (380 + i * 11 % 100), height / 2 - 15, 300 - i * 85); dummy.scale.set(180, height, 160); dummy.updateMatrix(); mountains.setMatrixAt(i, dummy.matrix); }
  scene.add(dashes, trees, mountains);
  const finish = new THREE.Group(); finish.name = 'race-finish'; scene.add(finish);
  const banner = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xe6b752 })); banner.position.y = 7; banner.scale.set(15, 1.4, .4); finish.add(banner);
  for (const side of [-1, 1]) { const post = new THREE.Mesh(box, cream); post.position.set(side * 7, 3.5, 0); post.scale.set(.3, 7, .3); finish.add(post); }
  const checks = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0x283f44 }), 14);
  for (let i = 0; i < 14; i++) { dummy.position.set(-6.5 + i, 7 + (i % 2 ? .35 : -.35), .23); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, .7, .05); dummy.updateMatrix(); checks.setMatrixAt(i, dummy.matrix); } finish.add(checks); finish.visible = false;
  const rivals: THREE.Group[] = [], wheels: THREE.Mesh[][] = [];
  return {
    attachRiders(bike: THREE.Group) {
      [0xc87155, 0x699dc7, 0xa18ac1, 0xe3b84b, 0x6caba0].forEach(color => {
        const rider = bike.clone(true); rider.name = 'simulated-racer';
        // Each clone shares geometry; only jersey/frame colour materials differ.
        rider.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial && [0x466e55, 0xdf8459].includes(o.material.color.getHex())) { o.material = o.material.clone(); o.material.color.setHex(color); } });
        const riderWheels: THREE.Mesh[] = []; rider.traverse(o => { if (o instanceof THREE.Mesh && o.geometry instanceof THREE.TorusGeometry) riderWheels.push(o); });
        wheels.push(riderWheels); scene.add(rider); rivals.push(rider);
      });
    },
    update(race: RaceState, timed: boolean) {
      const local = race.distance % ROAD_LENGTH;
      race.riders.forEach((rider, i) => {
        const gap = rider.distance - race.distance, d = local + gap, object = rivals[i];
        if (!object) return; object.visible = Math.abs(gap) < 320;
        object.position.set(roadX(d) + (i % 2 ? -3 : 3), .2, 110 - d); object.rotation.set(0, -roadHeading(d), 0);
        wheels[i].forEach(wheel => { wheel.rotation.z = rider.distance / 1.3; });
      });
      const remaining = 300 - race.elapsed; finish.visible = timed && remaining <= 12;
      const d = local + Math.max(0, remaining) * race.speed;
      finish.position.set(roadX(d), 0, 110 - d); finish.rotation.y = -roadHeading(d);
    },
  };
}
