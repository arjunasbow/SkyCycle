import * as THREE from 'three';
import { clamp } from './flight';

/** Shared bicycle geometry, two-link legs and a small seated-to-sprint posture change. */
export function createCyclingRig(bike: THREE.Group) {
  const torso = bike.getObjectByName('rider-torso'), helmet = bike.getObjectByName('rider-helmet');
  const upper = [-1, 1].map(side => bike.getObjectByName(`rider-thigh-${side}`) as THREE.Mesh);
  const lower = [-1, 1].map(side => bike.getObjectByName(`rider-shin-${side}`) as THREE.Mesh);
  const wheels: THREE.Mesh[] = [];
  bike.traverse(o => { if (o instanceof THREE.Mesh && o.geometry instanceof THREE.TorusGeometry) wheels.push(o); });
  const start = new THREE.Vector3(), knee = new THREE.Vector3(), foot = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0), delta = new THREE.Vector3();
  const link = (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    delta.copy(b).sub(a); const length = delta.length();
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(axis, delta.normalize());
    mesh.scale.y = length / (mesh.geometry as THREE.CylinderGeometry).parameters.height;
  };
  let stance = 0;
  return { update(distance: number, speed: number, sprint: boolean, dt = 1 / 60) {
    // Integrated travel drives the cranks, so pause/resume never jumps the animation.
    stance += ((sprint ? 1 : 0) - stance) * (1 - Math.exp(-dt * 4));
    // At the top of the stroke, feet move toward the handlebars (local -Z).
    const phase = -distance * 1.2, rise = stance * .13;
    if (torso) { torso.position.y = 2.225 + rise; torso.position.z = .125 - rise * .3; }
    if (helmet) { helmet.position.y = 2.85 + rise; helmet.position.z = -.15 - rise * .5; }
    for (let i = 0; i < 2; i++) {
      if (!upper[i] || !lower[i]) continue;
      const side = i === 0 ? -1 : 1, a = phase + i * Math.PI;
      start.set(side * .18, 1.92 + rise, .3);
      foot.set(side * .25, .95 + Math.cos(a) * .22, Math.sin(a) * .22);
      const dy = foot.y - start.y, dz = foot.z - start.z, length = Math.hypot(dy, dz);
      const bend = Math.sqrt(Math.max(0, .68 ** 2 - (length / 2) ** 2));
      knee.set(side * .23, (start.y + foot.y) / 2 - dz / length * bend, (start.z + foot.z) / 2 + dy / length * bend);
      link(upper[i], start, knee); link(lower[i], knee, foot);
    }
    wheels.forEach(wheel => { wheel.rotation.z = distance / (.65 * bike.scale.x); });
    // Lean stays small enough to keep the helmet and hands close to their original pose.
    bike.userData.cadence = clamp(speed * 1.2 * 60 / (Math.PI * 2), 0, 120);
  } };
}
