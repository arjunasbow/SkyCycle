import * as THREE from 'three';
import type { Quality } from './world';
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

function addParadiseBird(scene: THREE.Scene) {
  const bird = new THREE.Group(); bird.name = 'kaleidoscope-paradise-bird'; scene.add(bird);
  const gold = new THREE.MeshBasicMaterial({ color: 0xffce65, side: THREE.DoubleSide });
  const turquoise = new THREE.MeshBasicMaterial({ color: 0x41e6c6, side: THREE.DoubleSide });
  const violet = new THREE.MeshBasicMaterial({ color: 0xb986ff, side: THREE.DoubleSide });
  const rose = new THREE.MeshBasicMaterial({ color: 0xff7eaf, side: THREE.DoubleSide });
  const bodyGeometry = new THREE.SphereGeometry(1, 12, 8);
  const body = new THREE.Mesh(bodyGeometry, turquoise); body.scale.set(.38, .38, 1.1); bird.add(body);
  const head = new THREE.Mesh(bodyGeometry, gold); head.scale.setScalar(.37); head.position.set(0, .28, -1); bird.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.12, .55, 6), gold);
  beak.rotation.x = -Math.PI / 2; beak.position.set(0, .24, -1.48); bird.add(beak);
  // Swept feather shapes lie in the flight plane, with a contrasting fan on each wing.
  const feather = new THREE.Shape(); feather.moveTo(0, 0);
  feather.bezierCurveTo(.5, -.4, 2.3, -.65, 3.4, 1.35);
  feather.bezierCurveTo(1.9, .9, .65, 1.3, 0, .55); feather.closePath();
  const wingGeometry = new THREE.ShapeGeometry(feather, 10); wingGeometry.rotateX(Math.PI / 2);
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group(); wing.scale.x = side; wings.push(wing); bird.add(wing);
    for (let j = 0; j < 3; j++) {
      const plume = new THREE.Mesh(wingGeometry, [violet, rose, gold][j]);
      plume.scale.setScalar(1 - j * .18); plume.position.set(0, j * .025, j * .18); wing.add(plume);
    }
  }
  const tail = new THREE.Group(); tail.name = 'paradise-tail'; bird.add(tail);
  const tailShape = new THREE.Shape(); tailShape.moveTo(0, 0);
  tailShape.bezierCurveTo(-.45, 1.5, -.55, 4.3, 0, 5.6);
  tailShape.bezierCurveTo(.55, 4.3, .45, 1.5, 0, 0);
  const tailGeometry = new THREE.ShapeGeometry(tailShape, 12); tailGeometry.rotateX(Math.PI / 2);
  for (let j = 0; j < 5; j++) {
    const plume = new THREE.Mesh(tailGeometry, [turquoise, violet, gold, rose, turquoise][j]);
    plume.position.set((j - 2) * .13, -.08 - Math.abs(j - 2) * .025, .65);
    plume.rotation.y = (j - 2) * .15; plume.scale.set(.65, 1, 1 - Math.abs(j - 2) * .12); tail.add(plume);
  }
  return { bird, wings, tail };
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
  // Curved, pointed petals, attached at their bases and opening away from the aperture.
  const petalGeometry = new THREE.SphereGeometry(1, quality === 'low' ? 12 : 20, 12);
  petalGeometry.translate(0, 1, 0);
  const petals: THREE.Group[] = [];
  const petalMaterial = new THREE.MeshBasicMaterial({ color: 0xd67ce8, wireframe: true });
  const petalCore = new THREE.MeshBasicMaterial({ color: 0x421e66, side: THREE.DoubleSide });
  for (let i = 0; i < 16; i++) {
    const root = new THREE.Group(), hinge = new THREE.Group(); root.rotation.z = i * Math.PI / 8; root.add(hinge); lotus.add(root); petals.push(hinge);
    for (const mat of [petalCore, petalMaterial]) { const petal = new THREE.Mesh(petalGeometry, mat); petal.scale.set(7, 26, 2.2); hinge.add(petal); }
  }
  const heart = new THREE.Mesh(new THREE.TorusGeometry(19, .22, 5, 64), new THREE.MeshBasicMaterial({ color: 0xffddb0 })); lotus.add(heart);
  const mandala = new THREE.Group(); mandala.name = 'kaleidoscope-mandala'; scene.add(mandala);
  const mandalaGeo = new THREE.TorusGeometry(1, .012, 4, 8), mandalaMat = new THREE.MeshBasicMaterial({ color: 0xffbf79 });
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(mandalaGeo, mandalaMat); m.scale.setScalar(38 + i * 4); m.rotation.z = i * .19; mandala.add(m); }
  const { bird, wings, tail } = addParadiseBird(scene);
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
  const batches = [rings, frames, glass, ribbons, lights];
  return { update(time: number, bike: THREE.Vector3, flow: FlowState, reduced: boolean) {
    const distance = distanceAt(bike.z), first = Math.floor((distance - 60) / 5) * 5;
    glassMaterial.uniforms.time.value = reduced ? 0 : time;
    ribbons.visible = flow.charge >= 15;
    for (let i = 0; i < 48; i++) {
      const d = Math.floor((distance - 60) / 15) * 15 + i * 15;
      const phase = ((d % JOURNEY_LENGTH) + JOURNEY_LENGTH) % JOURNEY_LENGTH;
      const blend = THREE.MathUtils.smoothstep(phase, 1380, 1500) * (1 - THREE.MathUtils.smoothstep(phase, 2050, 2220));
      place(routeX(d), routeY(d), 110 - d, blend > .001 ? corridorRadius(d) * 1.05 : .001, blend > .001 ? 14 : .001, blend > .001 ? corridorRadius(d) * 1.05 : .001);
      dummy.rotation.x = Math.PI / 2; dummy.updateMatrix(); glass.setMatrixAt(i, dummy.matrix);
      place(routeX(d), routeY(d), 110 - d, corridorRadius(d) * 1.12);
      dummy.rotation.z = d * .012 + (reduced ? 0 : time * .08); dummy.updateMatrix(); ribbons.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < count; i++) {
      const d = first + i * 5, x = routeX(d), y = routeY(d), z = 110 - d, chamber = chamberAt(d), chapter = chapterAt(d);
      const sparse = chamber > .35 && i % 4 !== 0;
      const ripple = Math.max(0, 1 - Math.abs(d - distance - (time - flow.ripple) * 85) / 25) * Math.max(0, 1 - (time - flow.ripple) / 5);
      const wave = Math.max(0, 1 - Math.abs(d - distance - (time - flow.wave) * 110) / 40) * Math.max(0, 1 - (time - flow.wave) / 7);
      const radius = corridorRadius(d);
      place(x, y, z, sparse ? .001 : radius + ripple + wave * 2);
      dummy.rotation.y = -Math.atan2(routeX(d + 1) - x, 1);
      dummy.rotation.x = Math.atan2(routeY(d + 1) - y, 1);
      dummy.updateMatrix(); rings.setMatrixAt(i, dummy.matrix); colour(d, time, flow.charge, reduced); const incoming = approachingRingLight(d - distance, time, d, reduced);
      tint.multiplyScalar(1 - .42 * (chapter < 2 ? 1 : 0));
      tint.lerp(secondary.setHex(0xf1ffed), Math.min(.9, (ripple + wave) * .3 + incoming * .85)); rings.setColorAt(i, tint);
      dummy.scale.setScalar(sparse ? .001 : radius * (chapter === 1 ? 1.16 : 1.5));
      dummy.rotation.z = reduced ? d * .002 : d * .004 + time * (chapter === 1 ? .12 : .035);
      dummy.updateMatrix(); frames.setMatrixAt(i, dummy.matrix); tint.multiplyScalar(chapter === 1 ? .7 : .24); frames.setColorAt(i, tint);
    }
    for (let i = 0; i < detailCount; i++) {
      const d = first + (i / detailCount) * count * 5, chapter = chapterAt(d), angle = i * 2.39996 + (reduced ? 0 : time * .045), radius = corridorRadius(d) + 2 + Math.sin(i * 17) * 1.5;
      place(routeX(d) + Math.cos(angle) * radius, routeY(d) + Math.sin(angle) * radius, 110 - d, chapter === 3 ? .7 : .28, chapter === 3 ? 2.8 : .28, .28);
      dummy.rotation.z = angle - Math.PI / 2; dummy.updateMatrix(); lights.setMatrixAt(i, dummy.matrix); colour(d + 90, time, flow.charge, reduced); lights.setColorAt(i, tint);
    }
    for (let i = 0; i < particleCount; i++) {
      const d = distance - 20 + ((i * 19.71 + (reduced ? 0 : time * 2)) % 230), a = i * 2.39996, r = 5 + (i % 11);
      positions[i * 3] = routeX(d) + Math.cos(a) * r; positions[i * 3 + 1] = routeY(d) + Math.sin(a) * r; positions[i * 3 + 2] = 110 - d;
    }
    geometry.attributes.position.needsUpdate = true; dust.visible = !reduced || flow.charge >= 5;
    (dust.material as THREE.PointsMaterial).size = flow.charge >= 30 ? .35 : .22;
    const encounter = Math.floor((distance + 80) / JOURNEY_LENGTH), lotusDistance = encounter * JOURNEY_LENGTH + 2760;
    lotus.position.set(routeX(lotusDistance), routeY(lotusDistance), 110 - lotusDistance);
    const opening = lotusOpening(lotusDistance - distance, flow.charge);
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i]; p.position.y = 5 + opening * 19; p.rotation.x = -1.35 + opening * 1.7;
    }
    lotus.rotation.z = reduced ? 0 : Math.sin(time * .06) * .12;
    petalMaterial.color.setHSL(.82 - opening * .08, .7, .53 + opening * .15);
    const chamberDistance = Math.floor((distance + 250) / JOURNEY_LENGTH) * JOURNEY_LENGTH + 1380;
    mandala.position.set(routeX(chamberDistance) + 105, routeY(chamberDistance) + 32, 110 - chamberDistance);
    mandala.rotation.z = reduced ? 0 : time * .035;
    stars.position.copy(bike);
    // Always present, including outside the tunnel: a companion rather than another target.
    const glide = reduced ? 0 : Math.sin(time * .85);
    bird.position.set(bike.x + 4.5 + (reduced ? 0 : Math.sin(time * .32) * 1.1), bike.y + 5.3 + glide * .85, bike.z - 9);
    bird.rotation.set(reduced ? 0 : Math.cos(time * .85) * .065, -Math.atan2(routeX(distance + 20) - routeX(distance), 20), reduced ? 0 : Math.sin(time * .32) * .1);
    wings[0].rotation.z = reduced ? -.06 : -.06 + Math.sin(time * 1.5) * .09;
    wings[1].rotation.z = -wings[0].rotation.z;
    tail.rotation.x = reduced ? 0 : Math.sin(time * .85 - .8) * .07;
    for (const batch of batches) { batch.instanceMatrix.needsUpdate = true; if (batch.instanceColor) batch.instanceColor.needsUpdate = true; }
  } };
}
