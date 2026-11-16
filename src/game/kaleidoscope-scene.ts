import * as THREE from 'three';
import { companionOffset } from './companion-motion';
import type { Quality } from './world';
import { addParadiseBird } from './paradise-bird';
import { addLotusHeart } from './lotus-heart';
import { addMandalaEncounter, encounterGapAt, lotusDistanceAt } from './mandala-encounter';
import { chamberAt, chapterAt, CHAPTER_LENGTH, corridorRadius, distanceAt, JOURNEY_LENGTH, lotusOpening, routeX, routeY, type FlowState } from './kaleidoscope';

// A broad illuminated band sweeps from the distance toward the rider every four seconds.
// Smooth chapter gates keep the glass and garden quiet, including chapter transitions.
export function approachingRingLight(ahead: number, time: number, distance: number, reduced: boolean) {
  if (reduced) return 0;
  const phase = ((distance % JOURNEY_LENGTH) + JOURNEY_LENGTH) % JOURNEY_LENGTH;
  const area = THREE.MathUtils.smoothstep(phase, 0, 90) * (1 - THREE.MathUtils.smoothstep(phase, CHAPTER_LENGTH * 2 - 180, CHAPTER_LENGTH * 2));
  const centre = 440 - (((time % 4) + 4) % 4) * 140;
  const envelope = Math.exp(-Math.pow((ahead - centre) / 38, 2));
  return envelope * area * (1 - chamberAt(distance));
}

const palettes = [0x38eadc, 0xc07bff, 0x58bfff, 0xff9fbb];
/** Fixed instance pools follow an infinite, deterministic route; no runtime mesh creation. */
export function addKaleidoscope(scene: THREE.Scene, quality: Quality) {
  scene.background = new THREE.Color(0x02030c); scene.fog = new THREE.Fog(0x02030c, 520, 1050);
  scene.add(new THREE.HemisphereLight(0xa7eaff, 0x4e285d, 1.8));
  const count = quality === 'low' ? 120 : quality === 'medium' ? 160 : 190;
  const dummy = new THREE.Object3D(), tint = new THREE.Color(), secondary = new THREE.Color();
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .018, 4, quality === 'low' ? 32 : 48), new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
  rings.name = 'kaleidoscope-rings'; rings.frustumCulled = false; scene.add(rings);
  const frames = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .012, 4, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
  frames.name = 'kaleidoscope-frames'; frames.frustumCulled = false; scene.add(frames);
  const glassMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } }, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 patternUV; void main(){ patternUV=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 patternUV; uniform float time;
      void main(){ vec2 p=patternUV*vec2(18.0,4.0);
        float ripple=sin(p.x+sin(p.y*2.0+time*.25)*1.8);
        float seam=smoothstep(.035,.12,abs(sin(p.x*1.6+sin(p.y+time*.15))));
        vec3 a=vec3(.025,.16,.24), b=vec3(.24,.045,.32);
        gl_FragColor=vec4(mix(a,b,ripple*.5+.5)*(.35+seam*.65),.28); }`
  });
  const glass = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, quality === 'low' ? 24 : 40, 1, true), glassMaterial, 48);
  glass.name = 'kaleidoscope-liquid-glass'; glass.frustumCulled = false; scene.add(glass);
  const ribbons = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .035, 4, 28, Math.PI * 1.3), new THREE.MeshBasicMaterial({ color: 0x9de6ff }), 48);
  ribbons.name = 'kaleidoscope-flow-ribbons'; ribbons.frustumCulled = false; scene.add(ribbons);
  const detailCount = quality === 'low' ? 180 : quality === 'medium' ? 360 : 540;
  const lights = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), detailCount);
  lights.name = 'kaleidoscope-lanterns'; lights.frustumCulled = false; scene.add(lights);
  const particleCount = quality === 'low' ? 100 : quality === 'medium' ? 240 : 400;
  const positions = new Float32Array(particleCount * 3), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xa6e7ff, size: .22, transparent: true, opacity: .6, depthWrite: false }));
  dust.name = 'kaleidoscope-dust'; dust.frustumCulled = false; scene.add(dust);
  const lotus = new THREE.Group(); lotus.name = 'kaleidoscope-lotus'; scene.add(lotus);
  // Layered, curved petals: smooth normals and pointed silhouettes rather than spheres.
  const rows = quality === 'low' ? 12 : 24, columns = quality === 'low' ? 4 : 8;
  const petalVertices: number[] = [], petalIndices: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, width = Math.pow(Math.sin(Math.PI * t), .65) + .002;
    for (let k = 0; k <= columns; k++) {
      const u = k / columns * 2 - 1;
      petalVertices.push(u * width, t * 2, .45 * Math.sin(Math.PI * t) * (1 - u * u) + .1 * t * t);
      if (j < rows && k < columns) { const n = j * (columns + 1) + k; petalIndices.push(n, n + columns + 1, n + 1, n + 1, n + columns + 1, n + columns + 2); }
    }
  }
  const petalGeometry = new THREE.BufferGeometry(); petalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(petalVertices, 3)); petalGeometry.setIndex(petalIndices); petalGeometry.computeVertexNormals();
  const veinCurve = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, j) => { const t = j / 12; return new THREE.Vector3(0, t * 2, .45 * Math.sin(Math.PI * t) + .1 * t * t + .012); }));
  const veinGeometry = new THREE.TubeGeometry(veinCurve, 24, .009, 4, false);
  const petals: THREE.Group[] = [];
  const petalMaterial = new THREE.MeshBasicMaterial({ color: 0xc181cb });
  const petalCore = new THREE.MeshLambertMaterial({ color: 0xcf7ea2, side: THREE.DoubleSide });
  for (let layer = 0; layer < 2; layer++) {
    const count = layer === 0 ? 16 : 12;
    for (let i = 0; i < count; i++) {
      const root = new THREE.Group(), hinge = new THREE.Group(); root.rotation.z = i * Math.PI * 2 / count + layer * .18; root.add(hinge); lotus.add(root); petals.push(hinge);
      hinge.name = `lotus-petal-${layer}-${i}`; hinge.userData.layer = layer;
      const surface = new THREE.Mesh(petalGeometry, petalCore), vein = new THREE.Mesh(veinGeometry, petalMaterial);
      surface.scale.set(layer ? 6 : 7.5, layer ? 21 : 27, layer ? 2.5 : 3); vein.scale.copy(surface.scale); hinge.add(surface, vein);
    }
  }
  const lotusHeart = addLotusHeart(lotus, quality, petalGeometry);
  const encounterScenery = addMandalaEncounter(scene, quality);
  const { bird, wings, tail } = addParadiseBird(scene, quality);
  bird.visible = false;
  bird.traverse(object => { object.frustumCulled = false; });
  const birdOffset = new THREE.Vector3();
  let birdPresence = 0, previousBirdTime = 0;
  const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4b9b9c }), 48);
  beacons.name = 'mandala-route-beacons'; beacons.frustumCulled = false; scene.add(beacons);
  // Distant shell: fixed, deterministic points outside the entire playable corridor.
  // Following translation only gives a stable celestial backdrop without a recycling seam.
  const starCount = quality === 'low' ? 450 : quality === 'medium' ? 800 : 1200;
  const starPositions = new Float32Array(starCount * 3), starColours = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const y = 1 - 2 * (i + .5) / starCount, angle = i * 2.399963229728653;
    const radius = 1200 + (i % 17) * 19, circle = Math.sqrt(1 - y * y);
    starPositions.set([Math.cos(angle) * circle * radius, y * radius, Math.sin(angle) * circle * radius], i * 3);
    const brightness = .35 + (i % 7) * .09;
    starColours.set([brightness * .85, brightness * .92, brightness], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColours, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
  stars.name = 'kaleidoscope-starfield'; stars.frustumCulled = false; scene.add(stars);
  function colour(d: number, time: number, charge: number, reduced: boolean) {
    const chapter = chapterAt(d), blend = THREE.MathUtils.smoothstep(d % CHAPTER_LENGTH, CHAPTER_LENGTH - 180, CHAPTER_LENGTH);
    tint.setHex(palettes[chapter]); secondary.setHex(palettes[(chapter + 1) % 4]); tint.lerp(secondary, blend);
    tint.offsetHSL(Math.sin(d * .008) * .035 + Math.sin(Math.floor(d / JOURNEY_LENGTH) * .7) * .03, 0, 0);
    tint.multiplyScalar(.58 + Math.min(1, charge / 5) * .28 + (reduced ? 0 : Math.sin(time * .8 - d * .009) * .07));
  }
  function place(x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, 0, 0);
  }
  const batches = [rings, frames, glass, ribbons, lights, beacons];
  return { update(time: number, bike: THREE.Vector3, flow: FlowState, reduced: boolean) {
    const distance = distanceAt(bike.z), first = Math.floor((distance - 60) / 5) * 5;
    glassMaterial.uniforms.time.value = reduced ? 0 : time;
    ribbons.visible = flow.charge >= 15;
    for (let i = 0; i < 48; i++) {
      const d = Math.floor((distance - 60) / 15) * 15 + i * 15;
      const phase = ((d % JOURNEY_LENGTH) + JOURNEY_LENGTH) % JOURNEY_LENGTH;
      const blend = THREE.MathUtils.smoothstep(phase, 1380, 1500) * (1 - THREE.MathUtils.smoothstep(phase, 2050, 2220)) * (1 - encounterGapAt(d));
      place(routeX(d), routeY(d), 110 - d, blend > .001 ? corridorRadius(d) * 1.05 : .001, blend > .001 ? 14 : .001, blend > .001 ? corridorRadius(d) * 1.05 : .001);
      dummy.rotation.x = Math.PI / 2; dummy.updateMatrix(); glass.setMatrixAt(i, dummy.matrix);
      place(routeX(d), routeY(d), 110 - d, encounterGapAt(d) > .95 ? .001 : corridorRadius(d) * 1.12 * (1 + encounterGapAt(d) * 4));
      dummy.rotation.z = d * .012 + (reduced ? 0 : time * .08); dummy.updateMatrix(); ribbons.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < count; i++) {
      const d = first + i * 5, x = routeX(d), y = routeY(d), z = 110 - d, chamber = chamberAt(d), chapter = chapterAt(d);
      const gap = encounterGapAt(d), sparse = gap > .95 || chamber > .35 && i % 4 !== 0;
      const ripple = Math.max(0, 1 - Math.abs(d - distance - (time - flow.ripple) * 85) / 25) * Math.max(0, 1 - (time - flow.ripple) / 5);
      const wave = Math.max(0, 1 - Math.abs(d - distance - (time - flow.wave) * 110) / 40) * Math.max(0, 1 - (time - flow.wave) / 7);
      const radius = corridorRadius(d);
      place(x, y, z, sparse ? .001 : (radius + ripple + wave * 2) * (1 + gap * 4));
      dummy.rotation.y = -Math.atan2(routeX(d + 1) - x, 1);
      dummy.rotation.x = Math.atan2(routeY(d + 1) - y, 1);
      dummy.updateMatrix(); rings.setMatrixAt(i, dummy.matrix); colour(d, time, flow.charge, reduced); const incoming = approachingRingLight(d - distance, time, d, reduced);
      tint.multiplyScalar(1 - .42 * (chapter < 2 ? 1 : 0));
      tint.lerp(secondary.setHex(0xf1ffed), Math.min(.9, (ripple + wave) * .3 + incoming * .85)); tint.multiplyScalar(1 - gap); rings.setColorAt(i, tint);
      dummy.scale.setScalar(sparse ? .001 : radius * (chapter === 1 ? 1.16 : 1.5) * (1 + gap * 4));
      dummy.rotation.z = reduced ? d * .002 : d * .004 + time * (chapter === 1 ? .12 : .035);
      dummy.updateMatrix(); frames.setMatrixAt(i, dummy.matrix); tint.multiplyScalar(chapter === 1 ? .7 : .24); frames.setColorAt(i, tint);
    }
    for (let i = 0; i < detailCount; i++) {
      const d = first + (i / detailCount) * count * 5, chapter = chapterAt(d), angle = i * 2.39996 + (reduced ? 0 : time * .045), radius = corridorRadius(d) + 2 + Math.sin(i * 17) * 1.5;
      place(routeX(d) + Math.cos(angle) * radius, routeY(d) + Math.sin(angle) * radius, 110 - d, (chapter === 3 ? .7 : .28) * (1 - encounterGapAt(d)), (chapter === 3 ? 2.8 : .28) * (1 - encounterGapAt(d)), .28 * (1 - encounterGapAt(d)));
      dummy.rotation.z = angle - Math.PI / 2; dummy.updateMatrix(); lights.setMatrixAt(i, dummy.matrix); colour(d + 90, time, flow.charge, reduced); lights.setColorAt(i, tint);
    }
    for (let i = 0; i < particleCount; i++) {
      const d = distance - 20 + ((i * 19.71 + (reduced ? 0 : time * 2)) % 230), a = i * 2.39996, r = 5 + (i % 11);
      positions[i * 3] = routeX(d) + Math.cos(a) * r; positions[i * 3 + 1] = routeY(d) + Math.sin(a) * r; positions[i * 3 + 2] = 110 - d;
    }
    geometry.attributes.position.needsUpdate = true; dust.visible = !reduced || flow.charge >= 5;
    (dust.material as THREE.PointsMaterial).size = flow.charge >= 30 ? .35 : .22;
    const lotusDistance = lotusDistanceAt(distance);
    lotus.position.set(routeX(lotusDistance), routeY(lotusDistance), 110 - lotusDistance);
    const opening = lotusOpening(lotusDistance - distance, flow.charge);
    lotusHeart.update(lotusDistance - distance, opening);
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i]; p.position.y = 5 + opening * (p.userData.layer ? 19 : 22); p.rotation.x = -1.35 + opening * (p.userData.layer ? 1.6 : 1.8);
    }
    lotus.rotation.z = reduced ? 0 : Math.sin(time * .06) * .12;
    petalMaterial.color.setHSL(.93 - opening * .025, .5, .6 + opening * .08);
    encounterScenery.update(distance, time, reduced);
    for (let i = 0; i < beacons.count; i++) {
      const d = Math.floor((distance - 30) / 12) * 12 + i * 12;
      place(routeX(d), routeY(d) - corridorRadius(d) * .55, 110 - d, encounterGapAt(d) > .1 ? 1 : .001);
      dummy.updateMatrix(); beacons.setMatrixAt(i, dummy.matrix);
    }
    stars.position.copy(bike);
    // Reward a fresh uninterrupted streak, not the charge/multiplier's grace period.
    const earnedBird = flow.inside && flow.streak + 1e-8 >= 30;
    if (time < previousBirdTime || time === 0 && !earnedBird) birdPresence = 0;
    const birdDt = Math.max(0, Math.min(.1, time - previousBirdTime)); previousBirdTime = time;
    birdPresence = reduced ? (earnedBird ? 1 : 0) : THREE.MathUtils.clamp(birdPresence + birdDt * (earnedBird ? .5 : -1), 0, 1);
    bird.visible = birdPresence > .001;
    const t = reduced ? 0 : time * .4;
    companionOffset(birdOffset,birdPresence,t,reduced,5.3);
    const heading = Math.atan2(routeX(distance + 20) - routeX(distance), 20);
    bird.position.set(bike.x + Math.cos(heading)*birdOffset.x-Math.sin(heading)*birdOffset.z,bike.y+birdOffset.y,bike.z+Math.sin(heading)*birdOffset.x+Math.cos(heading)*birdOffset.z);
    bird.rotation.set(Math.cos(t*1.8)*.045,-heading+Math.sin(t*.7)*.12,Math.cos(t*.7)*.075);
    // Wings stay outstretched throughout the glide, including arrival and departure.
    wings[0].rotation.z = -.06;
    wings[1].rotation.z = -wings[0].rotation.z;
    tail.rotation.x = reduced ? 0 : Math.sin(t*1.8-.8)*.06;
    for (const batch of batches) { batch.instanceMatrix.needsUpdate = true; if (batch.instanceColor) batch.instanceColor.needsUpdate = true; }
  }, dispose() { encounterScenery.dispose(); } };
}
