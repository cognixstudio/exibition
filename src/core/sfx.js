// sfx.js — tiny Web Audio sound effects (no audio files needed). Muted state is remembered.
const KEY = 'gesture-lab:muted';
let ac = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* ignore */ }
}

function ctx() {
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null;
  try {
    ac ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch { return null; }
}

/** One short tone. `slide` glides the pitch to a second frequency. */
export function beep(freq = 440, dur = 0.08, type = 'sine', vol = 0.05, slide = 0) {
  if (muted) return;
  const a = ctx();
  if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* audio is a bonus, never fatal */ }
}

let lastShoot = 0;
export const sfx = {
  shoot() { const n = performance.now(); if (n - lastShoot > 90) { lastShoot = n; beep(880, 0.05, 'square', 0.02, 440); } },
  hit() { beep(220, 0.06, 'triangle', 0.06); },
  boom() { beep(160, 0.28, 'sawtooth', 0.07, 40); },
  slice() { beep(700, 0.09, 'triangle', 0.05, 1200); },
  pick() { beep(660, 0.07, 'sine', 0.06); setTimeout(() => beep(990, 0.09, 'sine', 0.06), 70); },
  good() { beep(523, 0.1, 'sine', 0.06); setTimeout(() => beep(784, 0.14, 'sine', 0.06), 100); },
  bad() { beep(180, 0.3, 'sawtooth', 0.06, 70); },
  goal() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.06), i * 90)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'triangle', 0.06), i * 140)); },
  tone(i) { beep([392, 440, 523, 587, 659, 784][i % 6], 0.35, 'sine', 0.07); },
};
