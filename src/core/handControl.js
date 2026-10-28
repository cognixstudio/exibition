// handControl.js — use the whole app without a mouse.
//   • Move your INDEX FINGERTIP to steer a glowing cursor.
//   • PINCH (thumb tip + index tip) to click, or HOLD STILL over a button for ~1.3 s (dwell click).
//   • Hover the ▲ ▼ buttons on the right edge to scroll.
// Pages that already track your hand (Draw, Game, Sign, Characters) share their camera feed;
// otherwise this module opens its own hidden camera. Clicks over the camera "stage" are ignored,
// so drawing and games are never triggered by accident.
import { getTracker } from './handTracker.js';
import { startCamera, stopCamera } from './camera.js';
import { getSettings } from './storage.js';
import { toast } from './ui.js';

const KEY = 'gesture-lab:handctl';
const INTERACTIVE = 'button, a[href], input, select, textarea, label, summary, [role="button"], [role="radio"], .tab, .chip';
const TEXTY = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]), textarea, select';

let enabled = false, starting = false, ownActive = false, pinched = false, visible = false, fired = false;
let cursor = null, scrollBox = null, ownVideo = null, sup = null, unsub = null, hoverEl = null, dwellEl = null;
let px = 0, py = 0, tx = 0, ty = 0, dx = 0, dy = 0, dwellStart = 0, lastSeen = 0;

const clamp = (v) => Math.max(0, Math.min(1, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const isHandControl = () => enabled;

/** Turn hand control on/off. Remembers the choice for the next visit. */
export async function setHandControl(on) {
  if (on === enabled) return enabled;
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
  document.body.classList.toggle('hand-control', on);
  document.getElementById('handBtn')?.setAttribute('aria-pressed', String(on));
  if (on) {
    buildUi();
    unsub = getTracker().onResult(onResult);
    sup = setInterval(supervise, 800);
    toast('Hand control on. Point with your index finger, pinch thumb + index to click, or hold still over a button.', 'info', { duration: 7000 });
    await supervise();
  } else {
    clearInterval(sup); sup = null;
    unsub?.(); unsub = null;
    stopOwn(true);
    hoverEl?.classList.remove('hc-hover'); hoverEl = null; dwellEl = null;
    cursor?.remove(); scrollBox?.remove(); ownVideo?.remove();
    cursor = scrollBox = ownVideo = null; visible = false; pinched = false;
  }
  return enabled;
}

/** Re-enable on page load if it was on last time. */
export function restoreHandControl() {
  try { if (localStorage.getItem(KEY) === '1') setHandControl(true); } catch { /* ignore */ }
}

function buildUi() {
  cursor = document.createElement('div');
  cursor.id = 'hc-cursor'; cursor.className = 'off';
  cursor.innerHTML = '<b></b><i></i>';
  scrollBox = document.createElement('div');
  scrollBox.id = 'hc-scroll';
  scrollBox.innerHTML = '<button type="button" data-dir="-1" aria-label="Scroll up">▲</button><button type="button" data-dir="1" aria-label="Scroll down">▼</button>';
  scrollBox.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-dir]');
    if (b) window.scrollBy({ top: Number(b.dataset.dir) * 320, behavior: 'smooth' });
  });
  ownVideo = document.createElement('video');
  ownVideo.className = 'hc-video'; ownVideo.muted = true; ownVideo.playsInline = true;
  document.body.append(cursor, scrollBox, ownVideo);
}

// ---------- camera supervision: use a page's feed when there is one, else our own ----------
function stopOwn(stopTracker) {
  const t = getTracker();
  if (stopTracker && t.video === ownVideo) t.stop();
  ownActive = false;
  if (ownVideo) stopCamera(ownVideo);
}

async function supervise() {
  if (!enabled) return;
  const t = getTracker();
  if (t.running) {
    if (t.video !== ownVideo && ownActive) stopOwn(false); // a page is tracking now: free our camera
    return;
  }
  if (starting) return;
  starting = true;
  try {
    await t.init();
    if (!enabled || t.running) return;
    await startCamera(ownVideo);
    if (!enabled || t.running) { stopCamera(ownVideo); return; }
    ownActive = true;
    t.start(ownVideo);
  } catch (err) {
    console.warn('Hand control camera failed', err);
    toast(err?.message || 'Could not start the camera for hand control.', 'error');
    setHandControl(false);
  } finally {
    starting = false;
  }
}

// ---------- per-frame cursor logic ----------
function onResult({ hands }) {
  if (!enabled || !cursor) return;
  const now = performance.now();
  const h = hands[0];
  if (!h) {
    if (visible && now - lastSeen > 500) { cursor.classList.add('off'); visible = false; pinched = false; setProgress(0); }
    return;
  }
  lastSeen = now;
  const lm = h.landmarks, tip = lm[8];
  const S = getSettings(), mirror = S.mirror;
  // Map the comfortable middle of the camera view onto the whole screen.
  // Higher sensitivity = a smaller window of hand movement covers the screen.
  const sens = Math.max(0.5, Math.min(2, Number(S.hcSensitivity) || 1));
  const wx = Math.min(1, 0.76 / sens), wy = Math.min(1, 0.70 / sens);
  const x0 = 0.5 - wx / 2, y0 = 0.43 - wy / 2;
  const nx = clamp(((mirror ? 1 - tip.x : tip.x) - x0) / wx);
  const ny = clamp((tip.y - y0) / wy);
  const ratio = dist(lm[4], lm[8]) / (dist(lm[0], lm[9]) || 0.1); // pinch distance relative to hand size

  // Freeze the cursor while the fingers close, so the click lands where you aimed.
  if (!(ratio < 0.5 || pinched)) { tx = nx * innerWidth; ty = ny * innerHeight; }
  if (!visible) { px = tx; py = ty; visible = true; cursor.classList.remove('off'); }
  px += (tx - px) * 0.4; py += (ty - py) * 0.4;
  cursor.style.transform = `translate(${px}px, ${py}px)`;

  const raw = document.elementFromPoint(px, py);
  const inStage = !!raw?.closest('.stage');
  const el = !inStage && raw ? raw.closest(INTERACTIVE) : null;
  cursor.classList.toggle('over-stage', inStage);

  if (el !== hoverEl) { hoverEl?.classList.remove('hc-hover'); hoverEl = el; el?.classList.add('hc-hover'); }

  // Pinch = click (with hysteresis so it fires once per pinch).
  if (!pinched && ratio < 0.3) { pinched = true; cursor.classList.add('pinch'); press(el, px); }
  else if (pinched && ratio > 0.45) { pinched = false; cursor.classList.remove('pinch'); }

  // ▲ ▼ buttons scroll while hovered.
  if (el?.dataset?.dir) { window.scrollBy(0, Number(el.dataset.dir) * 14); setProgress(0); return; }

  dwellStep(el, now);
}

function dwellStep(el, now) {
  const s = getSettings().hcDwell;
  const dwellMs = (s == null ? 1.3 : Number(s)) * 1000;
  if (!(dwellMs > 0)) { dwellEl = null; setProgress(0); return; } // dwell turned off: pinch only
  const ok = el && !el.matches(TEXTY) && !el.matches('input[type="range"]');
  if (!ok) { dwellEl = null; fired = false; setProgress(0); return; }
  if (el !== dwellEl || Math.hypot(px - dx, py - dy) > 45) { dwellEl = el; dx = px; dy = py; dwellStart = now; fired = false; }
  if (fired || pinched) { setProgress(0); return; }
  const p = (now - dwellStart) / dwellMs;
  setProgress(p);
  if (p >= 1) { fired = true; setProgress(0); press(el, px); }
}

function setProgress(p) { cursor?.style.setProperty('--p', `${Math.min(1, p) * 360}deg`); }

/** Click (or the closest equivalent) on an element. */
function press(el, x) {
  if (!el) return;
  cursor.classList.add('press');
  setTimeout(() => cursor?.classList.remove('press'), 250);
  try {
    if (el.matches('input[type="range"]')) {
      const r = el.getBoundingClientRect(), min = Number(el.min || 0), max = Number(el.max || 100), step = Number(el.step || 1);
      const raw = min + clamp((x - r.left) / r.width) * (max - min);
      el.value = String(Math.round(raw / step) * step);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.matches(TEXTY)) {
      try { el.showPicker?.(); } catch { el.focus(); } // native menus may refuse; focusing still helps
      el.focus();
    } else {
      el.click();
    }
  } catch (err) { console.warn('Hand click failed', err); }
}
