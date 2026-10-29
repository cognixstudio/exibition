// vrmCharacter.js — renders a VRM avatar (Three.js + @pixiv/three-vrm) into a container.
// Features: upper-body portrait framing, transparent canvas, warm anime lighting, idle breathing, random blinking,
// greeting wave, speech lip-sync (aa morph), moods, and a complete dispose().
//
//   const c = createVrmCharacter(el, { url });
//   await c.ready;                 // resolves when the model is loaded (rejects on failure)
//   c.setState('speaking');        // 'idle' | 'listening' | 'thinking' | 'speaking'
//   c.pulseMouth(0.7);             // call from SpeechSynthesisUtterance.onboundary
//   c.triggerWave();
//   c.dispose();                   // stops the loop, frees GPU memory, removes the canvas
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const { damp, lerp, clamp } = THREE.MathUtils;
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ---- tweakable constants (pose angles are in radians) ----
const ARM_DOWN = 1.25;        // upper-arm roll when hanging at the side (|z|)
const ARM_WAVE_UP = 1.15;     // upper-arm roll when raised for a wave (|z|)
const HEAD_TILT = {           // head offsets per conversation state
  idle:      { x: 0,     y: 0,    z: 0 },
  listening: { x: -0.04, y: 0,    z: 0.09 },
  thinking:  { x: -0.1,  y: 0.18, z: 0.04 },
  speaking:  { x: 0,     y: 0,    z: 0 },
};

/**
 * @param {HTMLElement} container  element the canvas is appended to (should have a size)
 * @param {{url: string, fov?: number, bustHeight?: number, targetOffset?: number, minWidth?: number, maxDistance?: number,
 *          onProgress?: (e: ProgressEvent) => void}} options
 *   bustHeight   metres of the world visible vertically (smaller = tighter zoom). 0.95 ≈ waist to just above the head.
 *   targetOffset how far below the head bone the camera aims (0.2 ≈ chest level).
 *   minWidth     minimum metres visible horizontally; the camera backs off on very narrow containers.
 * @throws if WebGL is unavailable (wrap in try/catch and fall back to a 2D avatar)
 */
export function createVrmCharacter(container, options = {}) {
  const { url, fov = 30, bustHeight = 0.95, targetOffset = 0.2, minWidth = 0.7, maxDistance = 2.8, onProgress } = options;
  if (!url) throw new Error('createVrmCharacter: "url" is required');

  // ---------- renderer / scene / camera ----------
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0); // fully transparent
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 20);
  const lookTarget = new THREE.Vector3(0, 1.2, 0); // chest/head level; re-aimed from the head bone once the model loads

  // Warm anime lighting: key (directional) + ambient fill + faint cool rim.
  // (MToon materials expect roughly PI-scaled intensities, like the three-vrm examples.)
  const key = new THREE.DirectionalLight(0xfff0dc, Math.PI * 0.9);
  key.position.set(0.8, 1.6, 1.4);
  const ambient = new THREE.AmbientLight(0xffe6d0, 0.8);
  const rim = new THREE.DirectionalLight(0xc6dcff, 0.9);
  rim.position.set(-1.2, 1.2, -1.5);
  scene.add(key, ambient, rim);

  // Bust-shot framing: pick the distance that shows `bustHeight` metres vertically,
  // and only back off if that would show less than `minWidth` metres horizontally.
  function frame() {
    const aspect = camera.aspect || 1;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dForHeight = (bustHeight / 2) / tanHalf;
    const dForWidth = minWidth / (2 * tanHalf * aspect);
    const d = Math.min(Math.max(dForHeight, dForWidth), maxDistance);
    camera.position.set(lookTarget.x, lookTarget.y + 0.04, lookTarget.z + d);
    camera.lookAt(lookTarget);
  }

  function resize() {
    if (disposed) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frame();
  }

  let disposed = false;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(container);
  window.addEventListener('resize', resize);
  resize();
  frame();

  // ---------- animation state ----------
  let vrm = null;
  let bones = {};
  let t = 0;
  let stateName = 'idle';
  const tiltTarget = { ...HEAD_TILT.idle };
  const tilt = { x: 0, y: 0, z: 0 };

  let nextBlink = 1.5, blinkP = -1;
  let speaking = false, speakStart = 0, boundaryCount = 0;
  let pulse = 0, pulseAt = -10, mouth = 0;
  let happy = 0, surprised = 0;
  let mood = null, moodTimer = 0;
  let wave = null, pendingWave = false;

  const rot = (node, x, y, z) => { if (node) node.rotation.set(x, y, z); };

  function animate(dt) {
    const ex = vrm.expressionManager;

    // -- idle breathing + sway
    const breath = Math.sin(t * 1.7);
    rot(bones.spine, breath * 0.018, 0, 0);
    rot(bones.chest, breath * 0.012, 0, 0);

    // -- blinking: random 2-6 s gap, occasional double blink
    if (blinkP < 0 && t >= nextBlink) blinkP = 0;
    if (blinkP >= 0) {
      blinkP += dt / 0.18;
      if (blinkP >= 1) {
        blinkP = -1;
        nextBlink = t + (Math.random() < 0.2 ? 0.15 : 2 + Math.random() * 4);
      }
    }
    ex?.setValue('blink', blinkP >= 0 ? Math.sin(Math.PI * blinkP) : 0);

    // -- wave envelope (0..1)
    let w = 0, wt = 0;
    if (wave) {
      const p = (t - wave.start) / wave.dur;
      if (p >= 1) wave = null;
      else {
        w = p < 0.15 ? ease(p / 0.15) : p > 0.85 ? ease((1 - p) / 0.15) : 1;
        wt = t - wave.start;
      }
    }

    // -- arms: hang at the sides; right arm raises and sways while waving
    //    (model faces +Z, so the character's left arm is +X and rolls with -z to go down)
    rot(bones.leftUpperArm, 0, 0, -ARM_DOWN - breath * 0.01);
    rot(bones.leftLowerArm, 0, 0, 0);
    rot(bones.rightUpperArm, 0, 0, lerp(ARM_DOWN + breath * 0.01, -ARM_WAVE_UP, w));
    rot(bones.rightLowerArm, 0, 0, w * (-0.15 + Math.sin(wt * 11) * 0.45));

    // -- mouth (aa): word-boundary pulses; procedural flap if the voice never fires boundaries
    let mouthTarget = 0;
    if (speaking) {
      const age = t - pulseAt;
      if (boundaryCount > 0) mouthTarget = pulse * clamp(1 - age / 0.2, 0, 1);
      else if (t - speakStart > 0.45) {
        mouthTarget = clamp(0.25 + Math.sin(t * 14) * 0.4 + Math.sin(t * 23) * 0.2, 0, 0.8) * 0.8;
      }
    }
    mouth = damp(mouth, mouthTarget, 30, dt);
    ex?.setValue('aa', mouth);

    // -- emotions
    const happyTarget = Math.max(speaking ? 0.5 : 0, wave ? 0.7 : 0, mood === 'happy' ? 0.8 : 0);
    const surprisedTarget = mood === 'scared' ? 0.7 : 0;
    happy = damp(happy, happyTarget, 6, dt);
    surprised = damp(surprised, surprisedTarget, 8, dt);
    ex?.setValue('happy', happy);
    ex?.setValue('surprised', surprised);

    // -- head: idle drift + state tilt + small nod while talking
    tilt.x = damp(tilt.x, tiltTarget.x, 4, dt);
    tilt.y = damp(tilt.y, tiltTarget.y, 4, dt);
    tilt.z = damp(tilt.z, tiltTarget.z, 4, dt);
    const nod = Math.sin(t * 5.2) * 0.025 * mouth;
    rot(bones.head,
      Math.sin(t * 0.9) * 0.02 + tilt.x + nod,
      Math.sin(t * 0.45) * 0.06 + tilt.y,
      Math.sin(t * 0.6) * 0.02 + tilt.z + w * 0.05);
  }

  const clock = new THREE.Clock();
  function tick() {
    if (disposed) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    if (!vrm) return;
    animate(dt);
    vrm.update(dt);
    renderer.render(scene, camera);
  }

  // ---------- public API ----------
  const api = {
    ready: null,
    get isReady() { return !!vrm && !disposed; },

    /** 'idle' | 'listening' | 'thinking' | 'speaking' — safe to call before the model has loaded. */
    setState(s) {
      stateName = s;
      Object.assign(tiltTarget, HEAD_TILT[s] || HEAD_TILT.idle);
      if (s === 'speaking') api.startSpeaking(); else api.stopSpeaking();
    },
    startSpeaking() { if (!speaking) { speaking = true; speakStart = t; boundaryCount = 0; } },
    stopSpeaking() { speaking = false; },
    /** Call on every SpeechSynthesisUtterance "boundary" (word) event. strength: 0..1 */
    pulseMouth(strength = 0.7) {
      boundaryCount++;
      pulse = clamp(strength * (0.8 + Math.random() * 0.3), 0.25, 1);
      pulseAt = t;
    },
    triggerWave(duration = 2.6) {
      if (!vrm) { pendingWave = true; return; }
      if (!wave) wave = { start: t, dur: duration };
    },
    /** 'happy' | 'scared' | null — temporary expression. */
    setMood(m, ms = 1800) {
      mood = m;
      clearTimeout(moodTimer);
      if (m) moodTimer = setTimeout(() => { mood = null; }, ms);
    },
    resize,
    dispose,
  };

  // ---------- load the VRM ----------
  async function load() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url, onProgress);
    const model = gltf.userData.vrm;

    if (disposed) { // closed while downloading
      VRMUtils.deepDispose(model ? model.scene : gltf.scene);
      return api;
    }
    if (!model) throw new Error('The file is not a valid VRM model.');

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons?.(gltf.scene);
    VRMUtils.rotateVRM0(model); // VRM 0.x faces -Z; this turns it to face the camera (no-op for VRM 1.0)
    model.scene.traverse((o) => { o.frustumCulled = false; });
    scene.add(model.scene);

    const get = (n) => model.humanoid.getNormalizedBoneNode(n);
    bones = {
      spine: get('spine'), chest: get('chest'), head: get('head'),
      leftUpperArm: get('leftUpperArm'), leftLowerArm: get('leftLowerArm'),
      rightUpperArm: get('rightUpperArm'), rightLowerArm: get('rightLowerArm'),
    };
    if (model.lookAt) model.lookAt.target = camera; // eyes follow the viewer

    // Auto-frame: centre the camera on the head/upper body regardless of model height.
    scene.updateMatrixWorld(true);
    if (bones.head) {
      const p = new THREE.Vector3();
      bones.head.getWorldPosition(p);
      lookTarget.set(0, p.y - targetOffset, 0);
    }
    vrm = model;
    resize();
    frame();

    renderer.setAnimationLoop(tick);
    api.setState(stateName);
    if (pendingWave) { pendingWave = false; api.triggerWave(); }
    return api;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    ro?.disconnect();
    window.removeEventListener('resize', resize);
    clearTimeout(moodTimer);
    if (vrm) {
      scene.remove(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
      vrm = null;
    }
    scene.remove(key, ambient, rim);
    key.dispose?.(); rim.dispose?.();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  api.ready = load();
  return api;
}
