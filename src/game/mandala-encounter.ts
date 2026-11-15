import * as THREE from 'three';
import type { Quality } from './world';
import { JOURNEY_LENGTH, routeX, routeY } from './kaleidoscope';
export const MANDALA_DISTANCE = 1380;
export const mandalaDistanceAt = (distance: number) => Math.floor((distance + 250) / JOURNEY_LENGTH) * JOURNEY_LENGTH + MANDALA_DISTANCE;
export const LOTUS_DISTANCE = 2760;
export const lotusDistanceAt = (distance: number) => Math.max(0, Math.ceil((distance - LOTUS_DISTANCE - 220) / JOURNEY_LENGTH)) * JOURNEY_LENGTH + LOTUS_DISTANCE;
/** Smooth openings wrap across laps, but do not start a new ride inside a past encounter. */
function encounterGap(distance: number, centre: number) {
  if (distance < centre - 360) return 0;
  const relative = ((distance - centre + JOURNEY_LENGTH / 2) % JOURNEY_LENGTH + JOURNEY_LENGTH) % JOURNEY_LENGTH - JOURNEY_LENGTH / 2;
  return THREE.MathUtils.smoothstep(relative, -360, -300) * (1 - THREE.MathUtils.smoothstep(relative, 120, 180));
}
/** A fully open approach starts 300 m (~15 s at cruise) before each encounter. */
export const mandalaGapAt = (distance: number) => encounterGap(distance, MANDALA_DISTANCE);
export const lotusGapAt = (distance: number) => encounterGap(distance, LOTUS_DISTANCE);
export const encounterGapAt = (distance: number) => Math.max(mandalaGapAt(distance), lotusGapAt(distance));
function petalBand(radius: number, amplitude: number, lobes: number, segments: number, width: number) {
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2, r = radius + amplitude * Math.pow(Math.sin(angle * lobes / 2), 2);
    for (const offset of [-width, width]) vertices.push(Math.cos(angle) * (r + offset), Math.sin(angle) * (r + offset), Math.sin(angle * lobes) * .4);
    if (i < segments) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
/** Five bounded ornament batches plus a two-draw-call spiral galaxy. */
export function addMandalaEncounter(scene: THREE.Scene, quality: Quality) {
  const mandala = new THREE.Group(); mandala.name = 'kaleidoscope-mandala'; scene.add(mandala);
  const layers: THREE.Group[] = [], segments = quality === 'low' ? 240 : 480;
  const colours = [0x65cbbd, 0xb58bcd, 0xd2a86b, 0x709dcc];
  for (let i = 0; i < 4; i++) {
    const layer = new THREE.Group(); layer.name = `mandala-petal-layer-${i}`;
    const band = new THREE.Mesh(petalBand(25 + i * 11, 12 + i * 1.5, 12 + i * 6, segments, .17), new THREE.MeshBasicMaterial({ color: colours[i], side: THREE.DoubleSide }));
    layer.position.z = -i * 1.2; layer.add(band); layers.push(layer); mandala.add(layer);
  }
  const details = quality === 'low' ? 36 : quality === 'medium' ? 60 : 84;
  const lace = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .012, 4, quality === 'low' ? 24 : 40), new THREE.MeshBasicMaterial({ color: 0x8bb6cb }), details);
  lace.name = 'mandala-filigree'; mandala.add(lace);
  const jewels = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9ecdbf }), details);
  jewels.name = 'mandala-jewels'; mandala.add(jewels);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < details; i++) {
    const angle = i / details * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * 47, Math.sin(angle) * 47, 1); dummy.rotation.set(0, 0, angle); dummy.scale.set(15, 4, 1); dummy.updateMatrix(); lace.setMatrixAt(i, dummy.matrix);
    dummy.position.set(Math.cos(angle) * 75, Math.sin(angle) * 75, -1); dummy.scale.setScalar(i % 3 ? .35 : .65); dummy.updateMatrix(); jewels.setMatrixAt(i, dummy.matrix);
  }
  const portal = new THREE.Mesh(new THREE.TorusGeometry(22, .12, 6, 96), new THREE.MeshBasicMaterial({ color: 0x77cfc3 })); portal.name = 'mandala-open-centre'; mandala.add(portal);
  const galaxy = new THREE.Group(); galaxy.name = 'kaleidoscope-side-galaxy'; scene.add(galaxy);
  const count = quality === 'low' ? 1000 : quality === 'medium' ? 1800 : 2600;
  const positions = new Float32Array(count * 3), coloursArray = new Float32Array(count * 3), tint = new THREE.Color();
  let seed = 891; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < count; i++) {
    const r = Math.pow(random(), .7) * 78, a = r * .045 + (i % 4) * Math.PI / 2 + (random() - .5) * .36;
    positions.set([Math.cos(a) * r, Math.sin(a) * r * .66, (random() - .5) * (3 + r * .045)], i * 3);
    tint.setHSL(.1 + r / 78 * .57, .4, .7 - r / 78 * .36); coloursArray.set([tint.r, tint.g, tint.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(coloursArray, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 1.8, vertexColors: true, transparent: true, opacity: .8, depthWrite: false })); galaxy.add(stars);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xc7b595 })); core.scale.set(5, 3.3, 1); galaxy.add(core);
  return { update(distance: number, time: number, reduced: boolean) {
    const encounter = mandalaDistanceAt(distance);
    mandala.position.set(routeX(encounter), routeY(encounter), 110 - encounter);
    // Face the incoming route while keeping the centre exactly on the playable path.
    mandala.rotation.y = -Math.atan2(routeX(encounter + 1) - routeX(encounter), 1);
    mandala.rotation.x = Math.atan2(routeY(encounter + 1) - routeY(encounter), 1);
    layers.forEach((layer, i) => { layer.rotation.z = i * .13 + (reduced ? 0 : time * (i % 2 ? -.018 : .014)); });
    galaxy.position.set(routeX(encounter) + 145, routeY(encounter) + 48, 110 - encounter - 80);
    galaxy.rotation.set(.15, -.2, reduced ? .3 : .3 + time * .006);
  } };
}
