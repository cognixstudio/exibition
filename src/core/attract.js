// attract.js — Exhibition "attract mode". After a quiet spell (Exhibition mode only) the app resets to Home
// and shows a big "Wave to start!" screen with a talking character, top scores and a QR code.
// A wave (any hand in view), a tap or a key press wakes it up again.
import { getTracker } from './handTracker.js';
import { startCamera, stopCamera } from './camera.js';
import { getSettings, shareUrl } from './storage.js';
import { CHARACTERS, CHAR_ORDER, pickVoice } from './characters.js';
import { getBoard } from './leaderboard.js';
import { qrSvg } from './qr.js';
import { esc } from './ui.js';

const IDLE_MS = 45000;   // quiet time before attract mode starts
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastActive = Date.now();
let isActive = () => false;
let open = false, el = null, unsub = null, timers = [];

/** Call whenever something interesting happens (a hand, a tap, a chat message). */
export const pingActivity = () => { lastActive = Date.now(); };

export function initAttract({ isActive: active }) {
  isActive = active;
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, () => { if (!open) pingActivity(); }, { passive: true }));
  // Any hand seen by any page counts as activity.
  try { getTracker().onResult((p) => { if (p.detected && !open) pingActivity(); }); } catch { /* tracker unavailable */ }
  setInterval(() => { if (isActive() && !open && Date.now() - lastActive > IDLE_MS) show(); }, 2000);
}

async function show() {
  open = true;
  if (location.hash !== '#/home') location.hash = '#/home'; // reset: leaving a page also releases its camera

  const top = getBoard('fruit').slice(0, 3);
  let qr = '';
  try { qr = qrSvg(shareUrl(), { size: 112 }); } catch { /* link too long: skip the QR */ }

  const mine = document.createElement('div');
  el = mine;
  mine.className = 'attract';
  mine.setAttribute('role', 'dialog');
  mine.setAttribute('aria-label', 'Wave to start');
  mine.innerHTML = `
    <video class="attract-video" muted playsinline></video>
    <div class="attract-char buddy-avatar" data-state="idle"></div>
    <h1 class="attract-title">👋 Wave to start!</h1>
    <p class="attract-sub">Draw in the air · Play games · Translate signs · Chat with a character</p>
    ${top.length ? `<ol class="attract-board">${top.map((e, i) => `<li>${['🥇', '🥈', '🥉'][i]} ${esc(e.name)} <b>${e.score}</b></li>`).join('')}</ol>` : ''}
    ${qr ? `<div class="attract-qr">${qr}<span>Scan to try it on your phone</span></div>` : ''}
    <p class="attract-hint">Or tap anywhere</p>`;
  document.body.appendChild(mine);

  const charEl = mine.querySelector('.attract-char');
  let idx = Math.floor(Math.random() * CHAR_ORDER.length);

  // Rotate characters and let the current one call out to passers-by.
  const showChar = () => { charEl.innerHTML = CHARACTERS[CHAR_ORDER[idx]].svg; };
  const callOut = () => {
    const ch = CHARACTERS[CHAR_ORDER[idx]];
    if (!getSettings().speech || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(ch.hi);
      u.lang = 'en-US'; u.pitch = ch.pitch; u.rate = ch.rate;
      const v = pickVoice(speechSynthesis.getVoices(), 'en-US', ch.voice);
      if (v) u.voice = v;
      u.onstart = () => { charEl.dataset.state = 'speaking'; };
      u.onend = u.onerror = () => { charEl.dataset.state = 'idle'; };
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* speech blocked: silent is fine */ }
  };
  showChar(); callOut();
  timers.push(setInterval(() => { idx = (idx + 1) % CHAR_ORDER.length; showChar(); callOut(); }, 15000));

  // Wake up on tap or key.
  const wake = () => close();
  mine.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake, { once: true });

  // Wake up when a hand stays in view for half a second.
  try {
    await sleep(900); // let the previous page finish releasing the camera
    if (!open || el !== mine) return;
    const tracker = getTracker();
    await tracker.init();
    const video = mine.querySelector('video');
    await startCamera(video);
    if (!open || el !== mine) { stopCamera(video); return; }
    let seen = 0;
    unsub = tracker.onResult(({ detected, timestamp }) => {
      if (!detected) { seen = 0; return; }
      if (!seen) seen = timestamp;
      else if (timestamp - seen > 500) close();
    });
    tracker.start(video);
  } catch (err) {
    console.warn('Attract mode camera unavailable', err);
    const hint = mine.querySelector('.attract-hint');
    if (hint) hint.textContent = 'Tap anywhere to start';
  }
}

function close() {
  if (!open) return;
  open = false;
  pingActivity();
  timers.forEach(clearInterval); timers = [];
  unsub?.(); unsub = null;
  try { speechSynthesis.cancel(); } catch { /* unsupported */ }
  try { getTracker().stop(); } catch { /* not running */ }
  const video = el?.querySelector('video');
  if (video) stopCamera(video);
  el?.remove(); el = null;
  window.dispatchEvent(new Event('hashchange')); // re-render Home fresh so its camera preview restarts
}
