import * as THREE from 'three';
import type { Quality } from './world';
const hash = (x: number, y: number) => { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y); let u = x - ix, v = y - iy; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
}
/** Generated locally: a softly feathered, dusty stellar disk, not an imported photograph. */
export function andromedaTexture(quality: Quality) {
  const size = quality === 'low' ? 128 : quality === 'medium' ? 256 : 384, data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + .5) / size * 2 - 1, y = (j + .5) / size * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x);
    const cloud = noise(x * 17 + 40, y * 17 + 40) * .55 + noise(x * 43 + 83, y * 43 + 83) * .3 + noise(x * 100 + 60, y * 100 + 60) * .15;
    const spiral = Math.sin(a * 2 - Math.log(r + .09) * 8 + cloud * 2.5);
    const lane = Math.pow(Math.max(0, spiral), 7) * THREE.MathUtils.smoothstep(r, .13, .3) * (1 - THREE.MathUtils.smoothstep(r, .75, 1));
    const bulge = Math.exp(-r * r * 44), disk = Math.exp(-r * 2.5) * (1 - THREE.MathUtils.smoothstep(r, .78, 1));
    const luminosity = (disk * (.7 + cloud * .65) + bulge * .9) * (1 - lane * .55);
    const outer = THREE.MathUtils.smoothstep(r, .18, .7);
    const red = luminosity * (1 - outer * .27), green = luminosity * (.88 - outer * .08), blue = luminosity * (.68 + outer * .5);
    const k = (j * size + i) * 4;
    data[k] = Math.min(220, red * 220); data[k + 1] = Math.min(210, green * 220); data[k + 2] = Math.min(200, blue * 220);
    data[k + 3] = Math.min(245, (disk * 1.8 + bulge) * (1 - lane * .25) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat); texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true; texture.name = 'procedural-andromeda-disk'; return texture;
}
