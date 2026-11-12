import * as THREE from 'three';
import type { Quality } from './world';

/** Fixed seed makes artwork repeatable at each quality tier. */
export function sceneryRandom(seed = 841) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
const noise = (x: number, z: number) => Math.sin(x * .008 + Math.sin(z * .006) * 2) * .5 + Math.sin(z * .017 + x * .013) * .27 + Math.sin(x * .038 - z * .029) * .13;
export const enhancedBudget = { low: { trees: 540, segments: 80, flowers: 0 }, medium: { trees: 960, segments: 120, flowers: 160 }, high: { trees: 1440, segments: 160, flowers: 320 } };

/** All changes outside the playable +/-470m corridor are decorative. */
export function alpineHeight(x: number, z: number, floor: (x: number, z: number) => number) {
  const edge = THREE.MathUtils.smoothstep(Math.abs(x), 490, 970);
  const ridges = 180 + 210 * Math.pow(1 - Math.abs(noise(x, z)), 2) + 90 * Math.sin(z * .004 + x * .003);
  return floor(x, z) + edge * ridges;
}

export function addEnhancedValley(scene: THREE.Scene, quality: Quality, floor: (x: number, z: number) => number, riverX: (z: number) => number) {
  const random = sceneryRandom(), budget = enhancedBudget[quality];
  scene.background = new THREE.Color(0xc4d9df); scene.fog = new THREE.Fog(0xc4d9df, 360, 1590);
  // Reuse the world's lights, avoiding double illumination.
  scene.children.forEach(o => {
    if (o instanceof THREE.HemisphereLight) { o.color.set(0xffefd6); o.groundColor.set(0x536d76); o.intensity = 1.65; }
    if (o instanceof THREE.DirectionalLight) { o.color.set(0xffdaa5); o.intensity = 2.2; o.position.set(-400, 480, 220); }
  });
  const root = new THREE.Group(); root.name = 'enhanced-valley'; scene.add(root);
  const mat = (color: number, flatShading = false) => new THREE.MeshLambertMaterial({ color, flatShading });
  const grass = mat(0xffffff), stone = mat(0x8c9690, true), wood = mat(0x69513f), leaf = mat(0xffffff), plaster = mat(0xffedcd), roof = mat(0x84534c), glass = mat(0x34515a);
  const gable = createGable();
  const box = new THREE.BoxGeometry(1, 1, 1), rock = new THREE.IcosahedronGeometry(1, 0), crown = new THREE.IcosahedronGeometry(1, 1);
  // Layered, irregular branches in one shared geometry rather than a single cone.
  const pine = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(.65, .08), new THREE.Vector2(.3, .34),
    new THREE.Vector2(.56, .3), new THREE.Vector2(.22, .6), new THREE.Vector2(.4, .55),
    new THREE.Vector2(.1, .83), new THREE.Vector2(.24, .78), new THREE.Vector2(0, 1.12),
  ], 7);
  const terrain = new THREE.PlaneGeometry(3200, 3600, budget.segments, Math.round(budget.segments * 1.3));
  terrain.rotateX(-Math.PI / 2); terrain.translate(0, 0, -1250);
  const positions = terrain.getAttribute('position'), colors: number[] = [];
  const meadow = new THREE.Color(0x83a667), earth = new THREE.Color(0xaaa17b), granite = new THREE.Color(0x78868b), snow = new THREE.Color(0xe6e9de);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = alpineHeight(x, z, floor);
    positions.setY(i, y);
    const slope = Math.hypot(alpineHeight(x + 8, z, floor) - y, alpineHeight(x, z + 8, floor) - y) / 8;
    const c = meadow.clone().lerp(earth, THREE.MathUtils.clamp((slope - .25) * .6, 0, .65));
    c.lerp(granite, THREE.MathUtils.smoothstep(y, 90, 250));
    c.lerp(snow, THREE.MathUtils.smoothstep(y + noise(x * 3, z * 3) * 45, 410, 500));
    c.multiplyScalar(1 + noise(x * 2, z * 2) * .12); colors.push(c.r, c.g, c.b);
  }
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); terrain.computeVertexNormals(); grass.vertexColors = true;
  const land = new THREE.Mesh(terrain, grass); land.name = 'alpine-terrain'; root.add(land);

  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vDirection;
      void main(){
        float h=normalize(vDirection).y;
        vec3 c=mix(vec3(.77,.85,.87),vec3(.23,.52,.72),smoothstep(0.,.85,h));
        c=mix(c,vec3(.98,.85,.65),pow(max(0.,1.-abs(h)*6.),3.)*.25);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 24, 12), skyMat); sky.name = 'alpine-sky'; sky.frustumCulled = false; root.add(sky);

  // Opaque river: no reflection passes, textures, blending or per-frame allocations.
  const waterVertices: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 180; i++) {
    const z = 500 - i * 20, x = riverX(z), width = 23 + Math.sin(z * .012) * 2;
    waterVertices.push(x - width, .18, z, x + width, .18, z); uv.push(0, z, 1, z);
    if (i < 180) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const waterGeo = new THREE.BufferGeometry(); waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterVertices, 3)); waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); waterGeo.setIndex(indices);
  const waterMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: true, uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: { value: 0 } },
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){vUv=uv; vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){float edge=pow(abs(vUv.x*2.-1.),5.); float ripple=pow(max(0.,sin(vUv.y*.65+sin(vUv.x*34.)*1.4+time*2.)),18.); float streak=sin(vUv.y*.11+vUv.x*45.+time*.8)*.025; vec3 c=mix(vec3(.08,.34,.37),vec3(.39,.64,.56),edge)+streak; c+=ripple*.12; c+=edge*ripple*.16; gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(waterGeo, waterMat); water.name = 'flowing-river'; root.add(water);

  // Spatial batches preserve frustum culling. Small details also have a distance cutoff.
  type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; colors: THREE.Color[] };
  const chunks: { group: THREE.Group; z: number; detail: boolean }[] = [];
  const dummy = new THREE.Object3D();
  for (let chunk = 0; chunk < 8; chunk++) {
    const centerZ = 350 - chunk * 430, group = new THREE.Group(), detailGroup = new THREE.Group();
    group.name = `valley-chunk-${chunk}`; root.add(group); group.add(detailGroup); chunks.push({ group, z: centerZ, detail: false }, { group: detailGroup, z: centerZ, detail: true });
    const batches = new Map<string, Batch>();
    const put = (key: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = 0, color = 0xffffff) => {
      if (!batches.has(key)) batches.set(key, { geometry, material, matrices: [], colors: [] });
      dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, rotation, 0); dummy.updateMatrix();
      batches.get(key)!.matrices.push(dummy.matrix.clone()); batches.get(key)!.colors.push(new THREE.Color(color));
    };
    for (let i = 0; i < budget.trees / 8; i++) {
      const z = centerZ + (random() - .5) * 430, x = (random() - .5) * 1400;
      if (Math.abs(x) < 58 || Math.abs(x - riverX(z)) < 32 || (x > 100 && x < 235 && Math.abs(z - (120 - chunk * 430)) < 100)) continue;
      // Patchy woodland with clearings rather than a uniform grid.
      if (noise(x, z) < -.28) continue;
      const y = alpineHeight(x, z, floor), h = 10 + random() * 15, w = h * (.23 + random() * .14), angle = random() * Math.PI * 2;
      put('trunks', box, wood, x, y + h * .25, z, .6, h * .5, .6, angle);
      if (random() < .6) put('pines', pine, leaf, x, y + h * .2, z, w, h, w, angle, [0x315e50, 0x426c58, 0x527d61][i % 3]);
      else {
        put('crowns', crown, leaf, x, y + h * .7, z, w * 1.5, h * .4, w * 1.3, angle, [0x74934e, 0x98a45b, 0x5f874f, 0xc5ac62][i % 4]);
        put('crowns', crown, leaf, x + w * .65, y + h * .6, z + w * .3, w, h * .29, w, angle, 0x8c9d56);
      }
    }
    for (let i = 0; i < 36; i++) {
      const z = centerZ + (random() - .5) * 430, x = i < 20 ? riverX(z) + (i % 2 ? -1 : 1) * (26 + random() * 8) : (random() - .5) * 1300;
      const y = alpineHeight(x, z, floor), s = 1 + random() * 3;
      if (Math.abs(x) < 55) continue;
      put('rocks', rock, stone, x, y + s * .35, z, s * 1.5, s, s, random() * 6);
      put('detail-bush', crown, leaf, x + 4, y + 1, z, 2, 1.8, 2, random() * 6, 0x769466);
    }
    for (let i = 0; i < budget.flowers / 8; i++) {
      const z = centerZ + (random() - .5) * 340, x = 65 + random() * 90;
      put('detail-flowers', rock, leaf, x, floor(x, z) + .6, z, .45, .6, .45, 0, i % 2 ? 0xe9cc78 : 0xd7c4d6);
    }
    const villageZ = 120 - chunk * 430;
    // Gabled chalets with timber bands, windows, doors and stone chimneys.
    for (let i = 0; i < 6; i++) {
      const x = 120 + (i % 3) * 36 + random() * 8, z = villageZ - Math.floor(i / 3) * 42, y = floor(x, z), s = 8 + random() * 4;
      put('houses', box, plaster, x, y + s * .5, z, s * 1.5, s, s * 1.3, 0, i % 2 ? 0xf2dcba : 0xe7e5cd);
      put('timber', box, wood, x, y + s * .65, z + s * .66, s * 1.53, .5, .2);
      // Two sloping roof panels share a dedicated gable geometry below.
      put('roofs', gable, roof, x, y + s, z, s * 1.75, s * .65, s * 1.6, 0, i % 2 ? 0xffffff : 0xbcb0a4);
      put('chimneys', box, stone, x + s * .45, y + s * 1.4, z, 1.2, s * .65, 1.2);
      for (const dx of [-.43, .43]) for (const dy of [.3, .78]) put('windows', box, glass, x + s * dx, y + s * dy, z + s * .66, s * .23, s * .2, .15);
      put('doors', box, wood, x, y + s * .22, z + s * .66, s * .2, s * .44, .2);
    }
    // A low winding footpath stays well below the targets.
    for (let i = 0; i < 14; i++) {
      const z = villageZ + 25 - i * 8, x = 164 + Math.sin(i * .24) * 20;
      put('paths', box, stone, x, floor(x, z) + .12, z, 4, .2, 9, Math.cos(i * .24) * -.5, 0xe4cfa9);
    }
    if (chunk % 2 === 0) {
      const z = villageZ - 110, x = riverX(z);
      put('bridge', box, wood, x, 4.5, z, 64, 1.8, 9);
      for (const dz of [-4.3, 4.3]) {
        put('bridge', box, wood, x, 7.5, z + dz, 66, .5, .5);
        for (let j = -3; j <= 3; j++) put('bridge', box, wood, x + j * 10, 6, z + dz, .6, 3, .6);
      }
      for (const dx of [-23, 23]) put('bridge-stone', box, stone, x + dx, 1, z, 4, 10, 10);
    }
    if (chunk === 2 || chunk === 5) {
      const x = chunk === 2 ? -610 : 660, z = centerZ, y = alpineHeight(x, z, floor);
      put('ruins', box, stone, x, y + 12, z, 48, 24, 25);
      for (const dx of [-25, 25]) {
        put('ruins', box, stone, x + dx, y + 23, z, 14, 46, 16);
        for (const k of [-1, 1]) put('ruins', box, stone, x + dx + k * 4.5, y + 48, z, 4, 5, 16);
        put('ruin-windows', box, glass, x + dx, y + 30, z + 8.1, 3, 7, .2);
      }
    }
    for (const [key, batch] of batches) {
      const instances = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length); instances.name = key;
      batch.matrices.forEach((matrix, i) => { instances.setMatrixAt(i, matrix); instances.setColorAt(i, batch.colors[i]); });
      instances.computeBoundingSphere(); (key.startsWith('detail-') ? detailGroup : group).add(instances);
    }
  }
  const cloudMat = mat(0xfff3dc), clouds = new THREE.InstancedMesh(crown, cloudMat, quality === 'low' ? 60 : 100); clouds.name = 'alpine-clouds';
  for (let i = 0; i < clouds.count; i++) {
    const cluster = Math.floor(i / 5), puff = i % 5;
    // Hashes keep puffs in the same cloud while varying silhouettes.
    dummy.position.set(Math.sin(cluster * 9.7) * 850 + puff * 23, 270 + Math.cos(cluster * 4.3) * 55 + Math.sin(puff * 2) * 8, 320 - cluster * 180);
    dummy.scale.set(32 + random() * 16, 10 + random() * 9, 20 + random() * 14); dummy.rotation.set(0, random() * 6, 0); dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix);
  }
  clouds.computeBoundingSphere(); root.add(clouds);
  return { update(time: number, position: THREE.Vector3) {
    waterMat.uniforms.time.value = time; clouds.position.x = Math.sin(time * .012) * 28;
    sky.position.copy(position);
    for (const chunk of chunks) chunk.group.visible = Math.abs(position.z - chunk.z) < (chunk.detail ? quality === 'low' ? 280 : 480 : 1800);
  } };
}

// Triangular prism: eaves at y=0, ridge at y=1. Shared by every chalet.
function createGable() {
  const shape = new THREE.Shape(); shape.moveTo(-.5, 0); shape.lineTo(0, 1); shape.lineTo(.5, 0); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); geometry.translate(0, 0, -.5); return geometry;
}
