import * as THREE from 'three';
import { roadX, roadHeight, roadHeading, roadGrade, ROAD_LENGTH, type RaceState } from './race';
import type { Quality } from './world';
import { sceneryRandom } from './enhanced-valley';
import { createCyclingRig } from './cycling-rig';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import signTypeface from 'three/examples/fonts/helvetiker_regular.typeface.json';

const signFont = new FontLoader().parse(signTypeface);
const signMessages = [
  ['RIVER LOOP', 'Enjoy the ride'], ['PINE WOODS', 'Find your rhythm'],
  ['VALLEY VIEW', 'Keep rolling'], ['ALPINE WAY', 'Breathe easy'],
  ['RIVER AHEAD', 'Bridge 200 m'], ['STONE BRIDGE', 'River crossing'],
  ['MEADOW LANE', 'Nice and steady'], ['HILL VILLAGE', 'Take in the view'],
  ['SUMMIT ROAD', 'You have got this'], ['HOMEWARD', 'Stay with the pack'],
  ['OLD VILLAGE', 'Keep it smooth'], ['OPEN FIELDS', 'Room to breathe'],
  ['RIVER LOOP', 'Round we go'],
];

function signLettering(lines: string[], material: THREE.Material) {
  const lettering = new THREE.Group(); lettering.name = 'sign-lettering';
  lines.forEach((line, index) => {
    const geometry = new THREE.ShapeGeometry(signFont.generateShapes(line, index === 0 ? .36 : .22), 2);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!, width = bounds.max.x - bounds.min.x;
    geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, 0);
    const text = new THREE.Mesh(geometry, material);
    text.scale.setScalar(Math.min(1, 3.5 / width));
    text.position.set(0, index === 0 ? .12 : -.34, .086);
    lettering.add(text);
  });
  return lettering;
}

const CHUNK_LENGTH = 200;
export const roadSceneryBudget = { low: { trees: 14, flowers: 0, terrain: 20 }, medium: { trees: 24, flowers: 24, terrain: 28 }, high: { trees: 36, flowers: 48, terrain: 36 } };
/** Map each chunk to the nearest useful lap. Recycling happens behind the camera or beyond haze. */
export function roadChunkOffset(center: number, localDistance: number) {
  return Math.floor((localDistance - center + ROAD_LENGTH - 300) / ROAD_LENGTH) * ROAD_LENGTH;
}
const terrainY = (offset: number, d: number) => {
  const hills = THREE.MathUtils.smoothstep(Math.abs(offset), 70, 620);
  const ridge = 130 + Math.sin(d * Math.PI * 6 / ROAD_LENGTH + offset * .009) * 75 + Math.sin(d * Math.PI * 14 / ROAD_LENGTH + offset * .024) * 42;
  const channel = Math.max(0, 1 - Math.abs(d - 1100) / 24) * 4;
  return roadHeight(d) - .18 + hills * ridge - channel;
};

/** Spatially batched roadside parallax, a periodic route and shared procedural artwork. */
export function addRoadScenery(scene: THREE.Scene, quality: Quality = 'low') {
  const budget = roadSceneryBudget[quality], random = sceneryRandom(9402);
  scene.background = new THREE.Color(0xc5dce1); scene.fog = new THREE.Fog(0xc5dce1, 160, 1050);
  scene.children.forEach(object => {
    if (object instanceof THREE.HemisphereLight) { object.intensity = 1.7; object.groundColor.set(0x657b70); }
    if (object instanceof THREE.DirectionalLight) { object.intensity = 2.1; object.color.set(0xffe2b7); }
  });
  const root = new THREE.Group(); root.name = 'road-course'; scene.add(root);
  const mat = (color: number) => new THREE.MeshLambertMaterial({ color });
  const cream = mat(0xffefd0), green = mat(0xffffff), wood = mat(0x857053), stone = mat(0xa7a998), plaster = mat(0xe8d9ba), roof = mat(0x935b4e), dark = mat(0x314c55);
  const asphalt = mat(0x647079);
  const landscapeMaterial = mat(0xffffff); landscapeMaterial.vertexColors = true;
  // World-anchored pavement grain, patching and baked-looking canopy shadows.
  asphalt.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vPavement;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPavement = uv;');
    shader.fragmentShader = 'varying vec2 vPavement;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float pavementVariation = sin(vPavement.y * .037) * sin(vPavement.y * .11 + vPavement.x * 13.);
      float grain = fract(sin(dot(floor(vPavement * vec2(190.,17.)),vec2(12.9898,78.233))) * 43758.5453);
      float shade = smoothstep(.7,.98,sin(vPavement.y*.19 + vPavement.x*3.)) * .24 * (.5+.5*sin(vPavement.y*.009));
      diffuseColor.rgb *= 1. + pavementVariation * .07 + (grain-.5)*.045 - shade;
    `);
  };
  const box = new THREE.BoxGeometry(1, 1, 1), crown = new THREE.IcosahedronGeometry(1, 1), rock = new THREE.IcosahedronGeometry(1, 0);
  const pine = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(.65, .05), new THREE.Vector2(.28, .4), new THREE.Vector2(.48, .34), new THREE.Vector2(.16, .72), new THREE.Vector2(.3, .64), new THREE.Vector2(0, 1.15)], 6);
  const shape = new THREE.Shape(); shape.moveTo(-.5, 0); shape.lineTo(0, .8); shape.lineTo(.5, 0); shape.closePath();
  const gable = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); gable.translate(0, 0, -.5);
  const dummy = new THREE.Object3D();
  const chunks: { group: THREE.Group; detail: THREE.Group; center: number }[] = [];
  const roadMaterial = asphalt;
  for (let chunk = 0; chunk < ROAD_LENGTH / CHUNK_LENGTH; chunk++) {
    const start = chunk * CHUNK_LENGTH, center = start + CHUNK_LENGTH / 2;
    const group = new THREE.Group(), detail = new THREE.Group(); group.name = `road-chunk-${chunk}`; group.add(detail); root.add(group); chunks.push({ group, detail, center });
    type Batch = { geo: THREE.BufferGeometry; material: THREE.Material; transforms: THREE.Matrix4[]; colors: THREE.Color[] };
    const batches = new Map<string, Batch>();
    const put = (name: string, geo: THREE.BufferGeometry, material: THREE.Material, d: number, offset: number, y: number, sx: number, sy: number, sz: number, color = 0xffffff) => {
      if (!batches.has(name)) batches.set(name, { geo, material, transforms: [], colors: [] });
      dummy.position.set(roadX(d) + offset, y, 110 - d); dummy.rotation.set(0, -roadHeading(d), 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
      batches.get(name)!.transforms.push(dummy.matrix.clone()); batches.get(name)!.colors.push(new THREE.Color(color));
    };
    const ribbon = (width: number, segments: number, across: number, landscape: boolean) => {
      const vertices: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
      for (let j = 0; j <= segments; j++) for (let k = 0; k <= across; k++) {
        const d = start + j / segments * CHUNK_LENGTH, offset = (k / across - .5) * width;
        const y = landscape ? terrainY(offset, d) : roadHeight(d) + .1;
        vertices.push(roadX(d) + offset, y, 110 - d); uv.push(k / across, d);
        const c = new THREE.Color(0x87a66a).lerp(new THREE.Color(0x859397), THREE.MathUtils.smoothstep(y, 50, 180));
        c.multiplyScalar(1 + Math.sin(d * .08 + offset * .07) * .055); colors.push(c.r, c.g, c.b);
        if (j < segments && k < across) { const a = j * (across + 1) + k, b = a + across + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
    };
    const pavement = new THREE.Mesh(ribbon(14, 40, 1, false), roadMaterial); pavement.name = chunk === 0 ? 'race-road' : 'road-ribbon'; group.add(pavement);
    const groundMaterial = landscapeMaterial;
    const ground = new THREE.Mesh(ribbon(1800, 20, budget.terrain, true), groundMaterial); ground.name = 'road-landscape'; group.add(ground);
    for (let j = 0; j < 20; j++) {
      const d = start + j * 10, y = roadHeight(d);
      put('center-dashes', box, cream, d, 0, y + .14, .18, .03, 3);
      for (const side of [-1, 1]) {
        put('edge-lines', box, cream, d, side * 6.7, y + .14, .14, .03, 10.15);
        put('fence-posts', box, wood, d, side * 9, y + .8, .18, 1.7, .18);
        put('fence-rails', box, wood, d + 5, side * 9, roadHeight(d + 5) + 1.25, .16, .16, 10.15);
        if (j % 2 === 0) {
          put('reflectors', box, cream, d + 3, side * 7.8, roadHeight(d + 3) + .65, .18, 1.4, .22);
          put('reflector-tops', box, dark, d + 3, side * 7.8, roadHeight(d + 3) + 1.15, .2, .27, .24);
          put('detail-verges', crown, green, d + 2, side * (8.2 + random() * .6), roadHeight(d + 2) + .3, .7, .5, 1.5, 0xb4b773);
        }
      }
    }
    for (let i = 0; i < budget.trees; i++) {
      const d = start + random() * CHUNK_LENGTH, side = i % 2 ? -1 : 1;
      const offset = side * (11 + random() * (chunk % 4 === 0 ? 60 : 22));
      const h = 9 + random() * 11, y = terrainY(offset, d), conifer = i % 3 !== 0;
      put('tree-trunks', box, wood, d, offset, y + h * .25, .55, h * .5, .55);
      put(conifer ? 'conifers' : 'broadleaf', conifer ? pine : crown, green, d, offset, y + h * (conifer ? .2 : .7), h * (conifer ? .3 : .38), h * (conifer ? 1 : .42), h * .34, [0x476e50, 0x76914f, 0x4d7b60, 0x9a9e59][i % 4]);
      const bushD = d + 4, bushOffset = side * (13 + random() * 2);
      put('bushes', crown, green, bushD, bushOffset, terrainY(bushOffset, bushD) + .8, 1.5, 1.5, 2, 0x8b9c59);
    }
    for (let i = 0; i < budget.flowers; i++) {
      const d = start + random() * CHUNK_LENGTH, offset = (i % 2 ? -1 : 1) * (7.6 + random() * 1);
      put('detail-flowers', rock, green, d, offset, roadHeight(d) + .45, .28, .5, .28, i % 2 ? 0xecc75e : 0xd6b8d4);
    }
    const signD = start + 65, signY = roadHeight(signD);
    // The support ends exactly at the bottom edge of the board.
    put('sign-post', box, stone, signD, -10, signY + 1.375, .15, 2.75, .15);
    put('road-sign', box, dark, signD, -10, signY + 3.4, 4.2, 1.3, .15);
    const lettering = signLettering(signMessages[chunk % signMessages.length], cream);
    lettering.position.set(roadX(signD) - 10, signY + 3.4, 110 - signD);
    lettering.rotation.y = -roadHeading(signD); group.add(lettering);
    if ([2, 7, 10].includes(chunk)) for (let i = 0; i < 4; i++) {
      const d = start + 30 + i * 36, offset = i % 2 ? -33 : 35, y = terrainY(offset, d), s = 7 + i % 2 * 2;
      put('chalets', box, plaster, d, offset, y + s * .5, s * 1.4, s, s);
      put('chalet-roofs', gable, roof, d, offset, y + s, s * 1.7, s * .8, s * 1.3);
      put('chalet-timber', box, wood, d - s * .51, offset, y + s * .65, s * 1.4, .45, .2);
      for (const dx of [-2.5, 2.5]) put('chalet-windows', box, dark, d - s * .52, offset + dx, y + s * .45, 1.2, 1.5, .22);
      put('chimneys', box, stone, d, offset + 2, y + s * 1.5, 1, 4, 1);
    }
    if (chunk === 5) {
      const water = new THREE.Mesh(box, mat(0x569eaa)); water.name = 'road-stream'; water.position.set(0, roadHeight(1100) - 2.5, 110 - 1100); water.scale.set(420, .1, 22); group.add(water);
      for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
        const d = 1078 + i * 6;
        put('bridge-stone', box, stone, d, side * 7.2, roadHeight(d) + .6, .9, 1.3, 6.1);
        put('bridge-cap', box, cream, d, side * 7.2, roadHeight(d) + 1.3, 1.1, .25, 6.1);
      }
    }
    for (const [name, batch] of batches) {
      const instances = new THREE.InstancedMesh(batch.geo, batch.material, batch.transforms.length); instances.name = name;
      batch.transforms.forEach((matrix, i) => { instances.setMatrixAt(i, matrix); instances.setColorAt(i, batch.colors[i]); }); instances.computeBoundingSphere();
      (name.startsWith('detail-') ? detail : group).add(instances);
    }
  }
  const finish = new THREE.Group(); finish.name = 'race-finish'; scene.add(finish);
  const banner = new THREE.Mesh(box, mat(0xe6b752)); banner.position.y = 7; banner.scale.set(15, 1.4, .4); finish.add(banner);
  for (const side of [-1, 1]) { const post = new THREE.Mesh(box, cream); post.position.set(side * 7.5, 3.5, 0); post.scale.set(.3, 7, .3); finish.add(post); }
  const checks = new THREE.InstancedMesh(box, dark, 14);
  for (let i = 0; i < checks.count; i++) { dummy.position.set(-6.5 + i, 7 + (i % 2 ? .35 : -.35), .23); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, .7, .05); dummy.updateMatrix(); checks.setMatrixAt(i, dummy.matrix); } finish.add(checks); finish.visible = false;
  const rivals: THREE.Group[] = [], rigs: ReturnType<typeof createCyclingRig>[] = [];
  let player: THREE.Group | undefined, playerRig: ReturnType<typeof createCyclingRig> | undefined;
  let finishDistance: number | undefined;
  return {
    attachRiders(bike: THREE.Group) {
      player = bike; playerRig = createCyclingRig(bike);
      [0xc87155, 0x699dc7, 0xa18ac1, 0xe3b84b, 0x6caba0].forEach(color => {
        const rider = bike.clone(true); rider.name = 'simulated-racer';
        const materials = new Map<THREE.Material, THREE.Material>();
        rider.traverse(o => {
          if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial && [0x466e55, 0xdf8459].includes(o.material.color.getHex())) {
            if (!materials.has(o.material)) { const material = o.material.clone(); material.color.setHex(color); materials.set(o.material, material); }
            o.material = materials.get(o.material)!;
          }
        });
        rigs.push(createCyclingRig(rider)); scene.add(rider); rivals.push(rider);
      });
    },
    update(race: RaceState, timed: boolean, dt = 1 / 60) {
      const local = race.distance % ROAD_LENGTH;
      for (const chunk of chunks) {
        const offset = roadChunkOffset(chunk.center, local), gap = chunk.center + offset - local;
        chunk.group.position.z = -offset; chunk.group.visible = gap < 1200 && gap > -300;
        chunk.detail.visible = gap < (quality === 'low' ? 160 : 280) && gap > -100;
      }
      race.riders.forEach((rider, i) => {
        const gap = rider.distance - race.distance, d = local + gap, object = rivals[i];
        if (!object) return; object.visible = Math.abs(gap) < 260;
        object.position.set(roadX(d) + rider.lane, roadHeight(d) + .2, 110 - d);
        object.rotation.set(Math.atan(roadGrade(d)), -roadHeading(d), Math.sin(race.elapsed * 8 + i) * (rider.phase === 'attack' ? .025 : .008));
        rigs[i].update(rider.distance, rider.speed, rider.phase === 'attack' || timed && race.elapsed > 280, dt);
      });
      playerRig?.update(race.distance, race.speed, race.speed > 7.25, dt);
      if (player) player.userData.roadAnimated = true;
      const remaining = 300 - race.elapsed;
      // Fix the finish at its first appearance, rather than letting it chase the player.
      if (race.elapsed < 288 || !timed) finishDistance = undefined;
      if (timed && remaining <= 12 && finishDistance === undefined) finishDistance = race.distance + Math.max(0, remaining) * race.speed;
      finish.visible = finishDistance !== undefined && timed;
      const d = local + (finishDistance ?? race.distance) - race.distance;
      finish.position.set(roadX(d), roadHeight(d), 110 - d); finish.rotation.y = -roadHeading(d);
    },
  };
}
