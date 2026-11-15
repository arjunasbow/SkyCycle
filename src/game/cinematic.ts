import * as THREE from 'three';
import { WebGPURenderer, MeshBasicNodeMaterial, PostProcessing } from 'three/webgpu';
import { color, float, mix, pass, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { Graphics } from './graphics';
import { AdaptiveResolution, graphicsPixelCap } from './graphics-settings';
import type { Quality, Environment } from './world';
import { prepareCinematicRoad } from './cinematic-road';
import { prepareCinematicValley } from './cinematic-valley';
import { distanceAt, routeX, routeY } from './kaleidoscope';
import { lotusDistanceAt, lotusGapAt, mandalaDistanceAt } from './mandala-encounter';

export const CINEMATIC_LIGHTING = Object.freeze({
  ringGain: 1.25, accentGain: 1.15, bloomStrength: .12,
  bloomRadius: .25, bloomThreshold: .9, maxHalo: .012,
});
const colouredBatches = ['kaleidoscope-rings', 'kaleidoscope-frames', 'kaleidoscope-lanterns', 'kaleidoscope-flow-ribbons'];

/** Opt-in WebGPU rendering for Valley, Kaleidoscope and Road race. Nothing is imported on the standard path. */
export async function createCinematic(quality: Quality, environment: Environment = 'kaleidoscope'): Promise<Graphics> {
  if (!('gpu' in navigator)) throw new Error('WebGPU unavailable');
  const renderer = new WebGPURenderer({ antialias: quality === 'high', powerPreference: 'high-performance', alpha: false });
  try {
    await renderer.init();
    // Three can fall back internally to WebGL. Do not label that as WebGPU.
    if (!(renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend) throw new Error('WebGPU adapter unavailable');
  } catch (error) { renderer.dispose(); throw error; }
  const adaptive = new AdaptiveResolution(Math.min(window.devicePixelRatio, graphicsPixelCap(quality)));
  renderer.setPixelRatio(adaptive.ratio); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.info.autoReset = false;
  const clock = uniform(0), shimmer = uniform(1);
  let scenePass: ReturnType<typeof pass> | undefined, glow: ReturnType<typeof bloom> | undefined;
  let post: PostProcessing | undefined;
  let atmosphere: THREE.Group | undefined;
  let roadEffects: ReturnType<typeof prepareCinematicRoad> | undefined;
  const replaced = new Set<THREE.Material>();
  let disposed = false, lost = false;
  let failureHandler: (() => void) | undefined;
  renderer.onDeviceLost = () => { if (!disposed) { lost = true; failureHandler?.(); } };
  return {
    onFailure(handler) { failureHandler = handler; if (lost) handler(); },
    renderer, label: 'WebGPU · CINEMATIC', notice: '',
    async prepare(scene, camera) {
      if (environment === 'road' || environment === 'valley') {
        roadEffects = environment === 'valley' ? prepareCinematicValley(scene, renderer, quality, camera, replaced) : prepareCinematicRoad(scene, renderer, quality, camera, replaced);
        renderer.toneMappingExposure = 1.0;
        scenePass = pass(scene, camera); const beauty = scenePass.getTextureNode();
        glow = bloom(beauty, .04, .2, 1.3);
        post = new PostProcessing(renderer); post.outputNode = vec4(beauty.rgb.add(glow.rgb.min(vec3(.003))), beauty.a);
        const bird = scene.getObjectByName('valley-curious-bird'), visible = bird?.visible;
        if (bird) bird.visible = true;
        try { await renderer.compileAsync(scene, camera); }
        finally { if (bird) bird.visible = visible!; }
        post.render(); return;
      }
      // Missing instance colours at compilation produce white materials in WebGPU.
      // Fail safely instead of preparing a graph that cannot read the later colours.
      for (const name of colouredBatches.filter(name => name !== 'kaleidoscope-flow-ribbons')) {
        const batch = scene.getObjectByName(name) as THREE.InstancedMesh | undefined;
        if (batch && !batch.instanceColor) throw new Error('Initialise tunnel colours before compiling Cinematic graphics');
      }
      // Translate the one GLSL-only material to TSL, including instanced UV support.
      // Material replacement is confined to this newly-created scene.
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object.name === 'kaleidoscope-liquid-glass') {
          const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
          const p = uv().mul(vec2(18, 4));
          const ripple = sin(p.x.add(sin(p.y.mul(2).add(clock.mul(.25))).mul(1.8)));
          const seam = smoothstep(.035, .12, sin(p.x.mul(1.6).add(sin(p.y.add(clock.mul(.15))))).abs());
          material.colorNode = mix(vec3(.025, .16, .24), vec3(.24, .045, .32), ripple.mul(.5).add(.5)).mul(seam.mul(.65).add(.35)).mul(1.0);
          material.opacityNode = float(.24);
          replaced.add(object.material as THREE.Material); object.material = material;
        }
        // HDR values produce a restrained halo on the light sources, not on the HUD or rider.
        if (colouredBatches.includes(object.name)) {
          const original = object.material as THREE.MeshBasicMaterial;
          const material = new MeshBasicNodeMaterial({ color: original.color, side: original.side, transparent: original.transparent, opacity: original.opacity, depthWrite: original.depthWrite });
          material.colorNode = color(original.color).mul(CINEMATIC_LIGHTING.ringGain);
          // NodeMaterial's built-in vertex/instance colours remain active.
          replaced.add(original); object.material = material;
        }
      });
      // A small HDR lift on the shared feather and lotus-edge materials lets them catch the glow.
      const luminous = new Map<THREE.Material, MeshBasicNodeMaterial>();
      for (const name of ['kaleidoscope-paradise-bird', 'kaleidoscope-lotus']) {
        scene.getObjectByName(name)?.traverse(object => {
          if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
          const original = object.material;
          if (!(original instanceof THREE.MeshBasicMaterial) || name.includes('lotus') && !original.wireframe && original.color.getHex() === 0x421e66) return;
          let material = luminous.get(original);
          if (!material) {
            material = new MeshBasicNodeMaterial({ color: original.color, side: original.side, wireframe: original.wireframe });
            material.colorNode = color(original.color).mul(CINEMATIC_LIGHTING.accentGain); luminous.set(original, material); replaced.add(original);
          }
          object.material = material;
        });
      }
      // Soft translucent vertical veils give the broad encounter chambers atmospheric depth.
      // Fixed pool, outside the scoring corridor, no camera motion or gameplay changes.
      const veils = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }), 8);
      veils.name = 'cinematic-light-veils'; veils.frustumCulled = false;
      const veilMaterial = veils.material as MeshBasicNodeMaterial;
      const u = uv();
      veilMaterial.colorNode = mix(vec3(.13, .35, .65), vec3(.45, .16, .5), u.y);
      veilMaterial.opacityNode = sin(u.x.mul(Math.PI)).pow(3).mul(sin(u.y.mul(Math.PI))).mul(.055).mul(shimmer);
      const transform = new THREE.Object3D();
      for (let i = 0; i < 8; i++) { transform.position.set((i % 2 ? 1 : -1) * (24 + i * 3), 0, -i * 14); transform.scale.set(5 + i, 95, 1); transform.rotation.z = (i % 2 ? 1 : -1) * .17; transform.updateMatrix(); veils.setMatrixAt(i, transform.matrix); }
      atmosphere = new THREE.Group(); atmosphere.name = 'cinematic-atmosphere'; atmosphere.add(veils); scene.add(atmosphere);
      scenePass = pass(scene, camera);
      const beauty = scenePass.getTextureNode();
      glow = bloom(beauty, quality === 'low' ? .08 : CINEMATIC_LIGHTING.bloomStrength, CINEMATIC_LIGHTING.bloomRadius, CINEMATIC_LIGHTING.bloomThreshold);
      // Hard bound on added light, even where hundreds of rings overlap in the distance.
      // Keep the scene alpha rather than adding the bloom texture's alpha to it.
      const halo = glow.rgb.min(vec3(CINEMATIC_LIGHTING.maxHalo));
      post = new PostProcessing(renderer); post.outputNode = vec4(beauty.rgb.add(halo), beauty.a);
      // Warm the reward bird before hiding it so its first entrance need not compile materials.
      const rewardBird = scene.getObjectByName('kaleidoscope-paradise-bird'), birdWasVisible = rewardBird?.visible;
      if (rewardBird) rewardBird.visible = true;
      try { await renderer.compileAsync(scene, camera); }
      finally { if (rewardBird) rewardBird.visible = birdWasVisible!; }
      // Compile the post stack too while the ride is still on its loading screen.
      post.render();
    },
    render(_scene, camera, elapsed, reduced, dt) {
      if (disposed || !post || !glow) return;
      if (roadEffects) {
        roadEffects.update(camera, elapsed, reduced, dt); glow.strength.value = reduced ? .015 : .04;
        if (adaptive.sample(dt)) renderer.setPixelRatio(adaptive.ratio);
        renderer.info.reset(); post.render(); return;
      }
      clock.value = reduced ? 0 : elapsed;
      const distance = distanceAt(camera.position.z) + 16;
      const encounter = lotusGapAt(distance) > .1 ? lotusDistanceAt(distance) : mandalaDistanceAt(distance);
      atmosphere?.position.set(routeX(encounter), routeY(encounter) + 5, 110 - encounter);
      shimmer.value = reduced ? .45 : .85 + Math.sin(elapsed * .25) * .15;
      glow.strength.value = reduced ? .04 : quality === 'low' ? .08 : CINEMATIC_LIGHTING.bloomStrength;
      if (adaptive.sample(dt)) renderer.setPixelRatio(adaptive.ratio);
      renderer.info.reset(); post.render();
    },
    dispose() {
      if (disposed) return; disposed = true;
      const errors: unknown[] = [];
      // Always reach the renderer even if one postprocessing target/listener fails.
      for (const resource of [post, glow, scenePass, roadEffects, ...replaced, renderer]) {
        try { resource?.dispose(); } catch (error) { errors.push(error); }
      }
      replaced.clear();
      if (errors.length) console.warn('Recovered from Cinematic resource cleanup errors.', ...errors);
    }
  };
}
