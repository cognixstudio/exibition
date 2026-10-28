// setup-mediapipe.js — runs after `npm install` (and before dev/build).
// 1) Copies the MediaPipe WASM runtime from node_modules to public/mediapipe/wasm
// 2) Downloads the gesture model to public/models (skipped if already present).
// Failures are non-fatal: the app falls back to the Google-hosted model at runtime.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDest = resolve(root, 'public/mediapipe/wasm');
const modelDest = resolve(root, 'public/models/gesture_recognizer.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

try {
  if (existsSync(wasmSrc)) {
    mkdirSync(wasmDest, { recursive: true });
    cpSync(wasmSrc, wasmDest, { recursive: true });
    console.log('[setup] MediaPipe WASM copied.');
  } else {
    console.warn('[setup] @mediapipe/tasks-vision not installed yet; skipping WASM copy.');
  }
} catch (err) {
  console.warn('[setup] Could not copy WASM:', err.message);
}

if (!existsSync(modelDest)) {
  try {
    const res = await fetch(MODEL_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dirname(modelDest), { recursive: true });
    writeFileSync(modelDest, Buffer.from(await res.arrayBuffer()));
    console.log('[setup] Gesture model downloaded.');
  } catch (err) {
    console.warn('[setup] Model download failed; the app will load it from Google at runtime.', err.message);
  }
}
