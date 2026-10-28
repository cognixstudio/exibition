// home.js — hero, three mode cards, camera onboarding + live gesture preview.
import { startCamera, stopCamera, applyMirror } from '../core/camera.js';
import { getTracker } from '../core/handTracker.js';
import { createOverlay } from '../core/overlay.js';

const GESTURES = [
  ['Thumb_Up', '👍', 'Thumbs up'],
  ['Victory', '✌️', 'Victory'],
  ['Open_Palm', '🖐️', 'Open palm'],
  ['Closed_Fist', '✊', 'Fist'],
  ['Pointing_Up', '☝️', 'Pointing'],
  ['ILoveYou', '🤟', 'I love you'],
];

const MODES = [
  { href: '#/draw', icon: '✍️', title: 'Air Draw', accent: 'var(--cyan)',
    text: 'Paint glowing strokes in mid-air, then ask the AI what you drew.', hint: '☝️ draw · 🖐️ pause · ✊ erase · ✌️ color' },
  { href: '#/game', icon: '🎮', title: 'Gesture Game', accent: 'var(--magenta)',
    text: 'Five games: rock-paper-scissors, fruit slicer, space shooter, air hockey and a gesture memory challenge.', hint: '✊ ✋ ✌️ · palm · index fingertip' },
  { href: '#/sign', icon: '🤟', title: 'Sign Translator', accent: 'var(--lime)',
    text: 'Spell with the ASL alphabet and turn it into speech in your language.', hint: 'Hold a sign for one second' },
  { href: '#/buddy', icon: '🤖', title: 'Talk to Zippy', accent: 'var(--cyan)',
    text: 'Chat out loud with a joking AI buddy that talks back.', hint: 'Speak or type · jokes on demand' },
];

export function render(container) {
  container.innerHTML = `
  <section class="page home">
    <div class="hero">
      <div class="hero-text">
        <h1>Your hands are the controller.</h1>
        <p class="lead">Draw in the air, play games, and sign letters. All you need is a webcam.</p>
      </div>

      <aside class="card preview" aria-label="Live gesture preview">
        <div id="onboard" class="onboard">
          <h2>Turn on your camera</h2>
          <ul>
            <li>Video is processed in your browser and never uploaded.</li>
            <li>Only the hand-tracking model needs to load, once.</li>
            <li>You can pick another camera in <a href="#/settings">Settings</a>.</li>
          </ul>
          <button class="btn primary" id="enableBtn">Enable camera</button>
          <p id="err" class="test-result bad" role="alert"></p>
        </div>

        <div id="loading" class="onboard" hidden>
          <div class="skeleton" style="height:150px"></div>
          <p class="muted" id="loadMsg">Loading hand model…</p>
        </div>

        <div id="live" hidden>
          <div class="stage small" id="stage"><video id="video" playsinline muted></video><canvas id="overlay"></canvas></div>
          <div class="g-strip" id="strip">
            ${GESTURES.map(([k, e, l]) => `<span class="g-chip" data-g="${k}" title="${l}">${e}</span>`).join('')}
          </div>
          <p class="g-label" id="gLabel">Show a hand</p>
        </div>
      </aside>
    </div>

    <div class="mode-grid">
      ${MODES.map((m) => `
        <a class="card mode" href="${m.href}" style="--accent:${m.accent}">
          <span class="mode-icon" aria-hidden="true">${m.icon}</span>
          <h2>${m.title}</h2>
          <p>${m.text}</p>
          <span class="mode-hint">${m.hint}</span>
        </a>`).join('')}
    </div>
  </section>`;

  const $ = (id) => container.querySelector('#' + id);
  const video = $('video'), tracker = getTracker();
  let active = true, unsub = null;

  function showOnly(id) {
    ['onboard', 'loading', 'live'].forEach((k) => { $(k).hidden = k !== id; });
  }

  async function start() {
    $('err').textContent = '';
    $('enableBtn').disabled = true;
    showOnly('loading');
    try {
      await tracker.init();
      if (!active) return;
      $('loadMsg').textContent = 'Starting camera…';
      await startCamera(video);
      if (!active) { stopCamera(video); return; }

      applyMirror($('stage'));
      const overlay = createOverlay($('overlay'), video);
      const chips = [...container.querySelectorAll('.g-chip')];
      let lastG = null;
      unsub = tracker.onResult(({ hands }) => {
        overlay.draw(hands);
        const g = hands[0]?.gesture ?? null;
        if (g === lastG) return; // only touch the DOM when the gesture changes
        lastG = g;
        chips.forEach((c) => c.classList.toggle('active', c.dataset.g === g));
        const match = GESTURES.find(([k]) => k === g);
        $('gLabel').textContent = match ? `${match[1]} ${match[2]}` : hands.length ? 'Hand found. Try a gesture.' : 'Show a hand';
      });
      tracker.start(video);
      showOnly('live');
    } catch (err) {
      console.error(err);
      stopCamera(video);
      if (!active) return;
      showOnly('onboard');
      $('enableBtn').disabled = false;
      $('enableBtn').textContent = 'Try again';
      $('err').textContent = err.message || 'Something went wrong.';
    }
  }

  $('enableBtn').addEventListener('click', start);

  // If the browser already granted camera access, skip the onboarding screen.
  navigator.permissions?.query({ name: 'camera' })
    .then((p) => { if (active && p.state === 'granted') start(); })
    .catch(() => { /* unsupported (e.g. Safari/Firefox): user clicks Enable */ });

  return () => {
    active = false;
    unsub?.();
    tracker.stop();
    stopCamera(video);
  };
}
