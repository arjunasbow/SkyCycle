import * as THREE from 'three';
import type { Quality } from './world';
import type { BikeState } from '../bike/types';
export function cyclingCadence(state: BikeState, now: number, estimate: number) {
  if (state.status !== 'simulated' && state.status !== 'connected') return 0;
  const sample = state.sample, age = now - (sample.cadenceAt ?? sample.timestamp);
  if (sample.cadence !== undefined) return age >= 0 && age < 3000 && Number.isFinite(sample.cadence) ? Math.max(0, Math.min(150, sample.cadence)) : 0;
  return Number.isFinite(estimate) ? Math.max(0, Math.min(150, estimate)) : 0;
}
/** Smooth local-space rider, with feet and pedals driven by fresh bike cadence. */
export function addTunnelRider(bike: THREE.Group, quality: Quality) {
  const root = new THREE.Group(); root.name = 'detailed-tunnel-rider'; bike.add(root);
  const segments = quality === 'low' ? 12 : 20;
  const sphere = new THREE.SphereGeometry(1, segments, 14), cylinder = new THREE.CylinderGeometry(1, 1, 1, segments);
  const skin = new THREE.MeshLambertMaterial({ color: 0xd3ac88 }), jersey = new THREE.MeshLambertMaterial({ color: 0x279c8a });
  const navy = new THREE.MeshLambertMaterial({ color: 0x253449 }), pearl = new THREE.MeshLambertMaterial({ color: 0xe0e4cf });
  const part = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(sphere, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); root.add(mesh); return mesh;
  };
  const axis = new THREE.Vector3(0, 1, 0), delta = new THREE.Vector3();
  const link = (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, width: number) => {
    delta.copy(b).sub(a); mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.scale.set(width, delta.length(), width); mesh.quaternion.setFromUnitVectors(axis, delta.normalize());
  };
  const bar = (mat: THREE.Material, a: number[], b: number[], width: number) => {
    const mesh = new THREE.Mesh(cylinder, mat); root.add(mesh); link(mesh, new THREE.Vector3(...a), new THREE.Vector3(...b), width); return mesh;
  };
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.23, .38, 6, segments), jersey); torso.position.set(0, 2.23, .12); torso.rotation.x = -.42; torso.name = 'rider-torso'; root.add(torso);
  part(navy, 0, 1.94, .3, .28, .2, .25);
  part(pearl, 0, 2.3, .35, .17, .23, .025); // reflective back panel
  part(skin, 0, 2.62, -.11, .11, .16, .11);
  part(skin, 0, 2.77, -.18, .245, .27, .25);
  const helmet = part(pearl, 0, 2.94, -.15, .31, .23, .35); helmet.name = 'rider-helmet';
  for (const side of [-1, 1]) {
    part(skin, side * .245, 2.76, -.13, .045, .075, .055);
    bar(jersey, [side * .19, 2.48, -.02], [side * .32, 2.23, -.27], .1);
    part(jersey, side * .19, 2.48, -.02, .13, .13, .13);
    bar(skin, [side * .32, 2.23, -.27], [side * .42, 1.96, -.83], .07);
    part(navy, side * .42, 1.96, -.83, .085, .065, .1);
  }
  for (let i = -2; i <= 2; i++) {
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, j) => { const a = (j / 8 - .5) * 2; return new THREE.Vector3(i * .09, 2.94 + Math.cos(a) * (.21 - Math.abs(i) * .018), -.15 + Math.sin(a) * .31); }));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, .015, 4, false), navy));
  }
  const legs = [-1, 1].map(side => {
    const thigh = bar(navy, [side * .18, 1.92, .3], [side * .23, 1.4, -.1], .105); thigh.name = `rider-thigh-${side}`;
    const shin = bar(skin, [side * .23, 1.4, -.1], [side * .26, 1, 0], .075); shin.name = `rider-shin-${side}`;
    const knee = part(skin, 0, 0, 0, .09, .09, .09), shoe = part(navy, 0, 0, 0, .12, .07, .23); shoe.name = `rider-shoe-${side}`;
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(.23, .04, .18), pearl); root.add(pedal);
    const crank = bar(pearl, [side * .25, .95, 0], [side * .25, .95, .23], .025); crank.name = `rider-crank-${side}`;
    return { side, thigh, shin, knee, shoe, pedal, crank };
  });
  const hip = new THREE.Vector3(), knee = new THREE.Vector3(), foot = new THREE.Vector3(), hub = new THREE.Vector3(); let phase = 0;
  const pose = () => {
    for (const leg of legs) {
      const angle = phase + (leg.side < 0 ? 0 : Math.PI);
      hip.set(leg.side * .18, 1.92, .3); foot.set(leg.side * .27, .95 + Math.cos(angle) * .23, -Math.sin(angle) * .23);
      const dy = foot.y - hip.y, dz = foot.z - hip.z, length = Math.hypot(dy, dz), bend = Math.sqrt(Math.max(0, .66 ** 2 - length ** 2 / 4));
      knee.set(leg.side * .23, (hip.y + foot.y) / 2 - dz / length * bend, (hip.z + foot.z) / 2 + dy / length * bend);
      link(leg.thigh, hip, knee, .105); link(leg.shin, knee, foot, .075); leg.knee.position.copy(knee);
      leg.shoe.position.copy(foot); leg.shoe.position.z -= .07; leg.pedal.position.copy(foot); leg.pedal.position.y -= .07;
      hub.set(leg.side * .27, .95, 0); link(leg.crank, hub, foot, .025);
    }
    root.userData.crankPhase = phase;
  };
  pose();
  return { update(cadence: number, dt: number) { if (Number.isFinite(dt) && dt > 0 && dt <= .1 && Number.isFinite(cadence)) { phase = (phase + Math.max(0, Math.min(150, cadence)) / 60 * Math.PI * 2 * dt) % (Math.PI * 2); pose(); } }, reset() { phase = 0; pose(); } };
}
