// handTracker.js — MediaPipe GestureRecognizer wrapped in a rAF loop.
// The recognizer is a singleton (loading it is slow); pages just start/stop the loop.
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

const abs = (p) => new URL(p, document.baseURI).href;
const WASM_DIR = () => abs(`${import.meta.env.BASE_URL}mediapipe/wasm`);
const LOCAL_MODEL = () => abs(`${import.meta.env.BASE_URL}models/gesture_recognizer.task`);
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

/** The gestures the app cares about; anything else is reported as 'None'. */
export const GESTURES = ['Thumb_Up', 'Victory', 'Open_Palm', 'Closed_Fist', 'Pointing_Up', 'ILoveYou'];

export class HandTracker {
  constructor() {
    this.recognizer = null;
    this.initPromise = null;
    this.running = false;
    this.video = null;
    this.listeners = new Set();
    this.lastVideoTime = -1;
    this.frameTimes = [];
    this.fps = 0;
    this.raf = 0;
  }

  /** Load the model once. Tries local file first, then Google's CDN; GPU first, then CPU. */
  init() {
    if (!this.initPromise) {
      this.initPromise = this._load().catch((err) => {
        this.initPromise = null; // allow retry
        throw err;
      });
    }
    return this.initPromise;
  }

  async _load() {
    let fileset;
    try {
      fileset = await FilesetResolver.forVisionTasks(WASM_DIR());
    } catch (err) {
      throw new Error('Could not load the MediaPipe runtime. Run `npm install` again and restart the dev server.');
    }

    const models = [];
    try { // Vite serves index.html for missing files, so check the content type.
      const r = await fetch(LOCAL_MODEL(), { method: 'HEAD' });
      if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) models.push(LOCAL_MODEL());
    } catch { /* offline or missing: use remote */ }
    models.push(REMOTE_MODEL);

    let lastErr;
    for (const modelAssetPath of models) {
      for (const delegate of ['GPU', 'CPU']) {
        try {
          this.recognizer = await GestureRecognizer.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate },
            runningMode: 'VIDEO',
            numHands: 1,
          });
          this.delegate = delegate;
          return this.recognizer;
        } catch (err) {
          lastErr = err;
          console.warn(`Hand model failed (${delegate}, ${modelAssetPath})`, err);
        }
      }
    }
    throw new Error(`Could not load the hand-tracking model. Check your internet connection. (${lastErr?.message || ''})`);
  }

  /** Subscribe to results. Returns an unsubscribe function. */
  onResult(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Begin the detection loop on a playing <video>. Call init() first. */
  start(video) {
    if (!this.recognizer) throw new Error('HandTracker.init() must finish before start().');
    this.stop();
    this.video = video;
    this.running = true;
    this.lastVideoTime = -1;
    this.frameTimes = [];
    this.raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  _loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._loop);
    const v = this.video;
    // Only process when the camera delivered a NEW frame.
    if (!v || v.readyState < 2 || v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;

    let res;
    try {
      res = this.recognizer.recognizeForVideo(v, performance.now());
    } catch (err) {
      console.warn('Detection frame failed', err);
      return;
    }

    // Rolling 1-second FPS.
    const now = performance.now();
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
    this.fps = this.frameTimes.length;

    const hands = (res.landmarks || []).map((landmarks, i) => {
      const g = res.gestures?.[i]?.[0];
      const raw = (res.handedness ?? res.handednesses)?.[i]?.[0]?.categoryName;
      return {
        landmarks, // 21 points, normalized 0..1 in the RAW (un-mirrored) frame
        // MediaPipe assumes a mirrored selfie image; we feed raw frames, so swap to get the user's real hand.
        handedness: raw === 'Left' ? 'Right' : raw === 'Right' ? 'Left' : 'Unknown',
        gesture: g && GESTURES.includes(g.categoryName) ? g.categoryName : 'None',
        rawGesture: g?.categoryName || 'None',
        score: g?.score ?? 0,
      };
    });

    const payload = { hands, detected: hands.length > 0, fps: this.fps, timestamp: now };
    this.listeners.forEach((cb) => { try { cb(payload); } catch (e) { console.error(e); } });
  };
}

let instance = null;
export const getTracker = () => (instance ??= new HandTracker());
