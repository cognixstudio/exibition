// sign.js — Sign Translator: ASL letters + signs -> text -> AI fix -> translate -> speak.
import { startCamera, stopCamera, applyMirror } from '../core/camera.js';
import { getTracker } from '../core/handTracker.js';
import { createOverlay } from '../core/overlay.js';
import { classify, MotionTracker } from '../core/aslRules.js';
import { getSettings } from '../core/storage.js';
import { askAI, NO_KEY_HTML } from '../core/openrouter.js';
import { toast, esc } from '../core/ui.js';
import { aiOrDemo, localFix } from '../core/demo.js';

const HOLD_MS = 1000;        // hold a sign this long to accept it
const SURE = 0.65;           // rule confidence needed without AI help
const RING_C = 2 * Math.PI * 34;

const WORDS = { HELLO: 'Hello', YES: 'Yes', NO: 'No', 'THANK YOU': 'Thank you', 'I LOVE YOU': 'I love you' };
const LANGS = [['en-US', 'English'], ['hi-IN', 'Hindi'], ['ta-IN', 'Tamil'], ['te-IN', 'Telugu'], ['bn-IN', 'Bengali'],
  ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['ja-JP', 'Japanese']];

const CHEAT = [
  ['A', 'Fist, thumb up along the side'], ['B', 'Flat hand up, thumb across palm'], ['C', 'Curved hand like a C'],
  ['D', 'Index up, other fingers touch thumb'], ['E', 'Fingers curled down, thumb tucked'], ['F', 'Thumb + index circle, 3 fingers up'],
  ['G', 'Index and thumb point sideways'], ['H', 'Index + middle point sideways'], ['I', 'Fist with pinky up'],
  ['J', 'Pinky draws a J (motion): type it'], ['K', 'V shape, thumb touches middle finger'], ['L', 'Index up, thumb out'],
  ['M', 'Thumb under three fingers'], ['N', 'Thumb under two fingers'], ['O', 'Fingertips meet thumb'],
  ['P', 'K shape pointing down'], ['Q', 'G shape pointing down'], ['R', 'Index and middle crossed'],
  ['S', 'Fist, thumb across front'], ['T', 'Fist, thumb between index and middle'], ['U', 'Index + middle up, together'],
  ['V', 'Index + middle up, apart'], ['W', 'Three fingers up, apart'], ['X', 'Index finger hooked'],
  ['Y', 'Thumb and pinky out'], ['Z', 'Index draws a Z (motion): type it'],
];
const CHEAT_SIGNS = [
  ['Hello', 'Wave an open hand side to side'], ['Yes', 'Nod a fist up and down'], ['No', 'Wag a pointing finger'],
  ['Thank you', 'Flat hand moves down and forward'], ['I love you', 'Thumb + index + pinky out'],
  ['Space', 'Hold an open palm still'], ['Backspace', 'Thumb down'],
];

export function render(container) {
  container.innerHTML = `
  <section class="page">
    <h1>Sign Translator</h1>
    <p class="muted">Hold a sign still for one second. To repeat a letter, lower your hand or change shape in between.</p>

    <div class="card" id="onboard">
      <h2>Turn on your camera</h2>
      <p class="muted">Video stays in your browser. If the AI helps with a tricky sign, only a small crop of your hand is sent to OpenRouter.</p>
      <button class="btn primary" id="enableBtn">Enable camera</button>
      <p id="err" class="test-result bad" role="alert"></p>
    </div>
    <div class="card" id="loading" hidden>
      <div class="skeleton" style="height:18px;width:60%"></div>
      <p class="muted" id="loadMsg">Loading hand model…</p>
    </div>

    <div id="live" hidden>
      <div class="stage fit" id="stage">
        <video id="video" playsinline muted></video>
        <canvas id="overlay"></canvas>
        <div class="hold" id="hud" aria-hidden="true">
          <svg viewBox="0 0 80 80"><circle class="ring-bg" cx="40" cy="40" r="34"/><circle class="ring-fg" id="ring" cx="40" cy="40" r="34"/></svg>
          <div class="hold-label" id="holdLabel">—</div>
        </div>
      </div>
      <div class="chips">
        <span class="chip" id="chipLabel">No hand</span>
        <span class="chip" id="chipSrc">—</span>
        <span class="chip" id="fps">FPS 0</span>
      </div>

      <div class="card">
        <label for="out" class="lbl">Your text</label>
        <textarea id="out" rows="3" placeholder="Recognized letters appear here. You can also edit or type."></textarea>
        <div class="toolbar left">
          <button class="btn ghost" id="spaceBtn">Space</button>
          <button class="btn ghost" id="backBtn">Backspace</button>
          <button class="btn ghost" id="clearBtn">Clear</button>
          <button class="btn primary" id="fixBtn">AI Fix</button>
          <button class="btn ghost" id="undoFixBtn" hidden>Undo fix</button>
        </div>
        <div class="speak-row">
          <select id="lang" aria-label="Language">${LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select>
          <button class="btn primary" id="speakBtn">Speak</button>
        </div>
        <p class="result-line" id="trans" aria-live="polite"></p>
      </div>

      <details class="card cheat">
        <summary>ASL cheat sheet</summary>
        <dl>${CHEAT.map(([l, t]) => `<div><dt>${l}</dt><dd>${t}</dd></div>`).join('')}</dl>
        <h3>Signs and controls</h3>
        <dl>${CHEAT_SIGNS.map(([l, t]) => `<div><dt class="wide">${l}</dt><dd>${t}</dd></div>`).join('')}</dl>
      </details>
    </div>
  </section>`;

  const $ = (id) => container.querySelector('#' + id);
  const video = $('video'), out = $('out'), tracker = getTracker(), motion = new MotionTracker();
  $('ring').style.strokeDasharray = RING_C;

  let active = true, unsub = null, overlay = null;
  // hold / accept state
  let votes = [], holdLabel = null, holdStart = 0, armed = true, lastAccepted = null, invalidSince = 0, motionUntil = 0;
  // steady-hand + AI fallback state
  let anchor = null, anchorId = 0, steadySince = 0, aiAsked = false, aiBusy = false, ai = null, aiDead = false, lastErrToast = 0;
  let lastChip = '', lastSrc = '';

  const aiEnabled = () => !!getSettings().apiKey.trim() && !getSettings().demo && !aiDead;

  // ---------- text actions ----------
  function accept(label) {
    if (label === 'BACKSPACE') out.value = out.value.slice(0, -1);
    else if (label === 'SPACE') { if (out.value && !out.value.endsWith(' ')) out.value += ' '; }
    else if (label.length === 1) out.value += label;
    else out.value += (out.value && !out.value.endsWith(' ') ? ' ' : '') + (WORDS[label] || label) + ' ';
    out.scrollTop = out.scrollHeight;
    $('hud').classList.add('flash');
    setTimeout(() => $('hud').classList.remove('flash'), 350);
  }
  $('spaceBtn').addEventListener('click', () => accept('SPACE'));
  $('backBtn').addEventListener('click', () => accept('BACKSPACE'));
  $('clearBtn').addEventListener('click', () => { out.value = ''; $('trans').textContent = ''; });

  function aiFail(err) {
    if (err.code === 'NO_KEY') return toast(NO_KEY_HTML, 'error', { html: true });
    if (err.code === 'AUTH' || err.code === 'CREDITS') aiDead = true;
    toast(err.message || 'The AI request failed.', 'error');
  }

  let beforeFix = null;
  $('fixBtn').addEventListener('click', async () => {
    const text = out.value.trim();
    if (!text) return toast('Sign some letters first.', 'info');
    const btn = $('fixBtn'); btn.disabled = true; btn.textContent = 'Fixing…';
    try {
      const { text: fixed, demo } = await aiOrDemo(() => askAI([{ role: 'user', content:
        'The text below was fingerspelled letter by letter in American Sign Language and read by a webcam, so it may contain wrong, missing or extra letters and no punctuation. ' +
        'Fix the spelling and turn it into one natural sentence. Reply with only the sentence.\n\nText: ' + text }], { maxTokens: 120, temperature: 0.2 }), () => localFix(text));
      if (!active) return;
      beforeFix = out.value; out.value = fixed.split('\n')[0].trim();
      $('undoFixBtn').hidden = false;
      toast(demo ? 'Offline tidy-up applied. Add an API key for full AI fixing.' : 'Text fixed.', demo ? 'info' : 'success');
    } catch (err) { if (active) aiFail(err); }
    finally { btn.disabled = false; btn.textContent = 'AI Fix'; }
  });
  $('undoFixBtn').addEventListener('click', () => {
    if (beforeFix !== null) out.value = beforeFix;
    beforeFix = null; $('undoFixBtn').hidden = true;
  });

  $('speakBtn').addEventListener('click', async () => {
    const text = out.value.trim();
    if (!text) return toast('Nothing to say yet.', 'info');
    if (!getSettings().speech) return toast('Speech output is turned off in Settings.', 'info');
    if (!('speechSynthesis' in window)) return toast('Speech is not supported in this browser.', 'error');
    let code = $('lang').value;
    const name = $('lang').selectedOptions[0].textContent;
    const btn = $('speakBtn'); btn.disabled = true;
    $('trans').textContent = '';
    let say = text;
    try {
      if (!code.startsWith('en')) {
        btn.textContent = 'Translating…';
        const r = await aiOrDemo(() => askAI([{ role: 'user', content:
          `Translate this text to ${name}. Reply with only the translation.\n\n${text}` }], { maxTokens: 200, temperature: 0.2 }), () => text);
        say = r.text.trim();
        if (r.demo) { code = 'en-US'; toast('AI is unavailable, so I will speak the original text.', 'info'); }
        if (!active) return;
        $('trans').textContent = say;
      }
      const voices = speechSynthesis.getVoices();
      if (voices.length && !voices.some((v) => v.lang.toLowerCase().startsWith(code.slice(0, 2)))) {
        toast(`No ${name} voice is installed on this device, so I can only show the text.`, 'info');
        return;
      }
      const u = new SpeechSynthesisUtterance(code.startsWith('en') ? say.toLowerCase() : say);
      u.lang = code;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (err) { if (active) aiFail(err); }
    finally { btn.disabled = false; btn.textContent = 'Speak'; }
  });

  // ---------- AI vision fallback ----------
  function cropHand(h) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const xs = h.landmarks.map((l) => l.x * vw), ys = h.landmarks.map((l) => l.y * vh);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const side = Math.min(Math.min(vw, vh), Math.max(96, Math.max(maxX - minX, maxY - minY) * 1.5));
    const sx = Math.max(0, Math.min(vw - side, (minX + maxX) / 2 - side / 2));
    const sy = Math.max(0, Math.min(vh - side, (minY + maxY) / 2 - side / 2));
    const c = document.createElement('canvas'); c.width = c.height = 256;
    c.getContext('2d').drawImage(video, sx, sy, side, side, 0, 0, 256, 256); // raw (un-mirrored) frame
    return c.toDataURL('image/jpeg', 0.85);
  }

  function parseAI(reply) {
    const word = reply.trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '');
    const map = { HELLO: 'HELLO', YES: 'YES', NO: 'NO', THANKYOU: 'THANK YOU', THANKS: 'THANK YOU', ILOVEYOU: 'I LOVE YOU', SPACE: 'SPACE' };
    if (word.length === 1) return word;
    return map[word] || null; // UNKNOWN or anything else
  }

  async function requestAI(h) {
    aiBusy = true; aiAsked = true;
    const myAnchor = anchorId;
    try {
      const reply = await askAI([{ role: 'user', content:
        'Which ASL letter/sign is this? Reply with one word. Choose from: A-Z, HELLO, YES, NO, THANKYOU, ILOVEYOU, SPACE, or UNKNOWN.' }],
      { image: cropHand(h), maxTokens: 8, temperature: 0 });
      if (active && myAnchor === anchorId) ai = { label: parseAI(reply), until: performance.now() + 4000 };
    } catch (err) {
      if (active && performance.now() - lastErrToast > 10000) { lastErrToast = performance.now(); aiFail(err); }
      else if (err.code === 'AUTH' || err.code === 'CREDITS') aiDead = true;
    } finally { aiBusy = false; }
  }

  // ---------- per-frame logic ----------
  function setHud(label, prog, done) {
    $('ring').style.strokeDashoffset = RING_C * (1 - prog);
    const el = $('holdLabel');
    const txt = !label ? '—' : label === 'SPACE' ? '␣' : label === 'BACKSPACE' ? '⌫' : label.length > 1 ? label.split(' ').map((w) => w[0]).join('') : label;
    el.textContent = txt;
    $('hud').classList.toggle('done', !!done);
  }
  function setChips(label, src) {
    if (label !== lastChip) { lastChip = label; $('chipLabel').textContent = label; }
    if (src !== lastSrc) { lastSrc = src; $('chipSrc').textContent = src; }
  }

  function vote() {
    const c = {};
    for (const v of votes) if (v.label) { const o = (c[v.label] ||= { n: 0, s: 0 }); o.n++; o.s += v.conf; }
    let best = null;
    for (const [label, o] of Object.entries(c)) if (o.n >= 4 && (!best || o.n > best.n)) best = { label, n: o.n, conf: o.s / o.n };
    return best;
  }

  function onNoHand(now) {
    votes = []; motion.clear(); holdLabel = null; anchor = null; ai = null; aiAsked = false;
    if (!invalidSince) invalidSince = now;
    if (now - invalidSince > 400) { armed = true; lastAccepted = null; }
    setHud(null, 0, false); setChips('No hand', '—');
  }

  function onResult({ hands, fps }) {
    overlay.draw(hands);
    $('fps').textContent = `FPS ${fps}`;
    const now = performance.now(), h = hands[0];
    if (!h) return onNoHand(now);

    const aspect = video.videoWidth / video.videoHeight || 4 / 3;
    const c = classify(h, aspect);

    // motion-based signs (Hello / Yes / No / Thank you)
    motion.push(now, h.landmarks[0].x * aspect, h.landmarks[0].y, c.scale);
    const m = now > motionUntil ? motion.detect(c.shape) : null;
    if (m) {
      motionUntil = now + 1500; motion.clear(); votes = []; holdLabel = null; armed = false; lastAccepted = m;
      accept(m); setChips(`${m} ✓`, 'motion'); setHud(null, 1, true);
      return;
    }

    // smooth static result over the last few frames
    votes.push(c.kind === 'none' ? { label: null, conf: c.conf } : c);
    if (votes.length > 7) votes.shift();
    const cand = vote();

    // is the hand holding still? (used to decide when the AI may help)
    const w = [h.landmarks[0].x * aspect, h.landmarks[0].y];
    if (!anchor || Math.hypot(w[0] - anchor[0], w[1] - anchor[1]) > 0.04) {
      anchor = w; steadySince = now; anchorId++; ai = null; aiAsked = false;
    }

    // decide what we are acting on
    let eff = null, src = 'rules';
    const sure = cand && cand.conf >= SURE;
    if (sure) eff = cand;
    else if (ai && ai.label && now < ai.until) { eff = { label: ai.label, conf: 0.7 }; src = 'AI'; }
    else if (cand && !aiEnabled() && cand.conf >= 0.5) eff = cand;  // no AI available: trust weaker rule
    if (!sure && !eff && aiEnabled() && !aiBusy && !aiAsked && now - steadySince > 800) requestAI(h);

    // hold-to-accept
    if (eff) {
      invalidSince = 0;
      if (eff.label !== holdLabel) { holdLabel = eff.label; holdStart = now; if (eff.label !== lastAccepted) armed = true; }
      const prog = armed ? Math.min(1, (now - holdStart) / HOLD_MS) : 1;
      if (armed && prog >= 1) { accept(eff.label); lastAccepted = eff.label; armed = false; }
      setHud(holdLabel, prog, !armed);
      setChips(`${eff.label} ${Math.round(eff.conf * 100)}%`, src === 'AI' ? 'AI helped' : 'rules');
    } else {
      if (!invalidSince) invalidSince = now;
      if (now - invalidSince > 400) { armed = true; lastAccepted = null; }
      holdLabel = null; setHud(null, 0, false);
      setChips(aiBusy ? 'Asking AI…' : 'Unsure. Hold steady', aiEnabled() ? 'AI fallback on' : 'add API key for AI help');
    }
  }

  // ---------- start / stop ----------
  function showOnly(id) { ['onboard', 'loading', 'live'].forEach((k) => { $(k).hidden = k !== id; }); }

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
      const oc = $('overlay');
      oc.width = video.videoWidth || 640; oc.height = video.videoHeight || 480;
      $('stage').style.setProperty('--ar', oc.width / oc.height);
      applyMirror($('stage'));
      overlay = createOverlay(oc, video);
      unsub = tracker.onResult(onResult);
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
  navigator.permissions?.query({ name: 'camera' })
    .then((p) => { if (active && p.state === 'granted') start(); })
    .catch(() => {});

  return () => {
    active = false;
    unsub?.();
    tracker.stop();
    stopCamera(video);
    try { speechSynthesis.cancel(); } catch { /* unsupported */ }
  };
}
