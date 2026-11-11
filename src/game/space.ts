import * as THREE from 'three';
import type { Quality } from './world';

/** Original procedural scenery: bounded geometry, no textures, network assets or postprocessing. */
export function addSpaceScenery(scene: THREE.Scene, quality: Quality) {
  scene.background = new THREE.Color(0x06091e);
  scene.fog = new THREE.Fog(0x06091e, 1300, 1650);
  scene.add(new THREE.HemisphereLight(0xb1d8ff, 0x604d95, 2));
  let seed = 804; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const points = (positions: number[], colors: number[], size: number, name: string) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending }));
    cloud.name = name; scene.add(cloud); return cloud;
  };
  const vertices: number[] = [], colors: number[] = [];
  const starCount = quality === 'low' ? 1600 : quality === 'medium' ? 2600 : 3800;
  for (let i = 0; i < starCount; i++) {
    vertices.push((random() - .5) * 2600, (random() - .35) * 1500, 600 - random() * 3900);
    const color = new THREE.Color().setHSL(.53 + random() * .17, .25, .55 + random() * .4); colors.push(color.r, color.g, color.b);
  }
  points(vertices, colors, 1.8, 'starfield');
  // Tilted spiral galaxies, rendered in a single draw call each.
  const galaxies: THREE.Points[] = [];
  for (let g = 0; g < 3; g++) {
    const positions: number[] = [], tints: number[] = [];
    for (let i = 0; i < (quality === 'low' ? 800 : 1500); i++) {
      const r = Math.pow(random(), .65) * 230, angle = r * .025 + (i % 3) * Math.PI * 2 / 3 + (random() - .5) * .45;
      positions.push(Math.cos(angle) * r, (random() - .5) * (12 + r * .06), Math.sin(angle) * r);
      const color = new THREE.Color().setHSL(.64 + r / 230 * .14, .5, .85 - r / 230 * .4); tints.push(color.r, color.g, color.b);
    }
    const galaxy = points(positions, tints, 3.6, 'spiral-galaxy');
    galaxy.position.set(g === 1 ? -530 : 410, 330 + g * 65, -550 - g * 850); galaxy.rotation.set(.7, 0, .35); galaxies.push(galaxy);
  }
  const sphere = new THREE.SphereGeometry(1, quality === 'low' ? 24 : 40, 20);
  const planets: THREE.Mesh[] = [];
  const palette = [0x5fa0c1, 0xcd9475, 0x8d79c2, 0x729e9b];
  for (let i = 0; i < 4; i++) {
    const planet = new THREE.Mesh(sphere, new THREE.MeshLambertMaterial({ color: palette[i], flatShading: true }));
    planet.name = 'planet'; planet.position.set(i % 2 ? -340 : 360, 150 + i * 38, -330 - i * 650); planet.scale.setScalar(65 + i * 9); scene.add(planet); planets.push(planet);
    // Surface bands and satellite give scale without texture downloads.
    if (i % 2 === 0) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.05, 64), new THREE.MeshBasicMaterial({ color: 0xb3a2d5, side: THREE.DoubleSide, transparent: true, opacity: .6, depthWrite: false }));
      ring.rotation.set(1.1, .3, .25); planet.add(ring);
    }
    const moon = new THREE.Mesh(sphere, new THREE.MeshLambertMaterial({ color: 0xb7beca, flatShading: true }));
    moon.scale.setScalar(14); moon.position.copy(planet.position).add(new THREE.Vector3(-110, 65, -35)); scene.add(moon);
  }
  const asteroids = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x8c879f, flatShading: true }), 36);
  asteroids.name = 'background-asteroids'; const dummy = new THREE.Object3D();
  for (let i = 0; i < 36; i++) {
    dummy.position.set((i % 2 ? -1 : 1) * (190 + random() * 380), -100 + random() * 330, 100 - random() * 2800);
    dummy.rotation.set(random() * 6, random() * 6, random() * 6); const size = 3 + random() * 9; dummy.scale.set(size, size * .7, size * 1.3); dummy.updateMatrix(); asteroids.setMatrixAt(i, dummy.matrix);
  }
  scene.add(asteroids);
  const comet = new THREE.Group(); comet.name = 'passing-comet'; scene.add(comet);
  const nucleus = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xe6fcff })); nucleus.scale.setScalar(2.5); comet.add(nucleus);
  const tailPositions: number[] = [], tailColors: number[] = [];
  for (let i = 0; i < 180; i++) { const t = random(); tailPositions.push(t * 120, t * 36 + (random() - .5) * t * 12, (random() - .5) * t * 10); tailColors.push(.25 * (1 - t), .8 * (1 - t), 1 - t * .65); }
  const tail = points(tailPositions, tailColors, 3, 'comet-tail'); comet.add(tail);
  return { update(time: number) {
    // One quiet flyby every 35 seconds; never crosses the scoring corridor.
    const phase = time % 35; comet.visible = phase < 12; comet.position.set(650 - phase * 95, 350 - phase * 7, -700);
    planets.forEach((planet, i) => { planet.rotation.y = time * .018 * (i % 2 ? -1 : 1); });
    galaxies.forEach(galaxy => { galaxy.rotation.y = time * .003; });
  } };
}
