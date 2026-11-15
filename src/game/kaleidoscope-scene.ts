import * as THREE from 'three';
import type { Quality } from './world';
import { chamberAt, chapterAt, CHAPTER_LENGTH, corridorRadius, distanceAt, JOURNEY_LENGTH, lotusOpening, routeX, routeY, type FlowState } from './kaleidoscope';

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
  const trail = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x99fff0 }), 32);
  trail.name = 'kaleidoscope-trail'; trail.frustumCulled = false; scene.add(trail);
  const companions = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ color: 0xffe4b2 }), 18);
  companions.name = 'kaleidoscope-companions'; companions.frustumCulled = false; scene.add(companions);
  function colour(d: number, time: number, charge: number, reduced: boolean) {
    const chapter = chapterAt(d), blend = THREE.MathUtils.smoothstep(d % CHAPTER_LENGTH, CHAPTER_LENGTH - 180, CHAPTER_LENGTH);
    tint.setHex(palettes[chapter]); secondary.setHex(palettes[(chapter + 1) % 4]); tint.lerp(secondary, blend);
    tint.offsetHSL(Math.sin(d * .008) * .035 + Math.sin(Math.floor(d / JOURNEY_LENGTH) * .7) * .03, 0, 0);
    tint.multiplyScalar(.58 + Math.min(1, charge / 5) * .28 + (reduced ? 0 : Math.sin(time * .8 - d * .009) * .07));
  }
  function place(x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, 0, 0);
  }
  const batches = [rings, frames, glass, ribbons, lights, trail, companions];
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
      dummy.updateMatrix(); rings.setMatrixAt(i, dummy.matrix); colour(d, time, flow.charge, reduced); tint.lerp(secondary.setHex(0xf1ffed), (ripple + wave) * .3); rings.setColorAt(i, tint);
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
    trail.visible = flow.charge >= 5; companions.visible = flow.charge >= 15;
    for (let i = 0; i < 32; i++) {
      const t = i / 31; place(bike.x + Math.sin(i * .4) * .3, bike.y + 2.5, bike.z + 3 + t * 20, (1 - t) * .24); dummy.updateMatrix(); trail.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < 18; i++) {
      const d = distance + 45 + i * 2, a = i * .45 + (reduced ? 0 : time * .2);
      place(routeX(d) + Math.cos(a) * 6, routeY(d) + Math.sin(a) * 4, 110 - d, .65, .15, 1.8); dummy.rotation.z = a; dummy.updateMatrix(); companions.setMatrixAt(i, dummy.matrix);
    }
    for (const batch of batches) { batch.instanceMatrix.needsUpdate = true; if (batch.instanceColor) batch.instanceColor.needsUpdate = true; }
  } };
}
