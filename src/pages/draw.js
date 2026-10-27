// draw.js — Air Draw: ☝️ draw · 🖐️ pause · ✊ erase · ✌️ change color.
import { startCamera, stopCamera, applyMirror } from '../core/camera.js';
import { getTracker } from '../core/handTracker.js';
import { createOverlay } from '../core/overlay.js';
import { getSettings } from '../core/storage.js';
import { askAI, AIError, NO_KEY_HTML } from '../core/openrouter.js';
import { toast, esc } from '../core/ui.js';
import { aiOrDemo, pickGuess } from '../core/demo.js';

const COLORS = ['#19f3ff', '#ff2fd0', '#b6ff3b', '#ffb020', '#ffffff'];
const MODE_LABEL = { Pointing_Up: '☝️ Drawing', Open_Palm: '🖐️ Paused', Closed_Fist: '✊ Erasing', Victory: '✌️ Changing color' };
const STABLE_FRAMES = 3;      // a gesture must persist this many frames before it counts (anti-flicker)
const COLOR_COOLDOWN = 900;   // ms between color changes
const MAX_STROKES = 300;

export function render(container) {
  container.innerHTML = `
  <section class="page">
    <h1>Air Draw</h1>
    <p class="muted">☝️ draw · 🖐️ pause · ✊ erase · ✌️ change color</p>

    <div class="card" id="onboard">
      <h2>Turn on your camera</h2>
      <p class="muted">Video stays in your browser. Only your drawing is sent to the AI, and only when you press AI Guess.</p>
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
        <canvas id="strokes"></canvas>
        <canvas id="overlay"></canvas>
      </div>
      <div class="chips">
        <span class="chip" id="modeBadge">👋 Show a hand</span>
        <span class="chip"><span class="swatch" id="swatch"></span> Color</span>
        <span class="chip" id="fps">FPS 0</span>
      </div>
      <div class="toolbar">
        <button class="btn ghost" id="undoBtn">Undo</button>
        <button class="btn ghost" id="clearBtn">Clear</button>
        <button class="btn ghost" id="saveBtn">Save as PNG</button>
        <button class="btn ghost" id="videoBtn" aria-pressed="false">Hide video</button>
        <button class="btn primary" id="guessBtn">AI Guess</button>
      </div>
      <div class="card result" id="result" hidden aria-live="polite"></div>
    </div>
  </section>`;

  const $ = (id) => container.querySelector('#' + id);
  const video = $('video'), strokesCanvas = $('strokes'), overlayCanvas = $('overlay');
  const sctx = strokesCanvas.getContext('2d'), octx = overlayCanvas.getContext('2d');
  const tracker = getTracker();

  let active = true, unsub = null, overlay = null;
  let W = 640, H = 480, scale = 1;
  let strokes = [], current = null;
  let colorIdx = 0, lastColorAt = 0;
  let mode = 'None', cand = 'None', candN = 0, smooth = null;

  // ---------- drawing ----------
  function trace(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]); // single dot
    else for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  /** Paint a polyline of stroke `s` onto ctx: neon glow + white core, or an eraser cut. */
  function paint(ctx, s, pts) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.type === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = s.size;
      ctx.strokeStyle = '#000';
      trace(ctx, pts);
    } else {
      ctx.strokeStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = s.size * 2.2;
      ctx.lineWidth = s.size;
      trace(ctx, pts);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = s.size * 0.3;
      trace(ctx, pts);
    }
    ctx.restore();
  }

  function redraw() {
    sctx.clearRect(0, 0, W, H);
    strokes.forEach((s) => s.points.length && paint(sctx, s, s.points));
  }

  function addPoint(type, p) {
    if (!current || current.type !== type) {
      current = { type, color: COLORS[colorIdx], size: (type === 'draw' ? 7 : 70) * scale, points: [] };
      strokes.push(current);
      if (strokes.length > MAX_STROKES) strokes.shift();
    }
    const last = current.points[current.points.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 2 * scale) return;
    current.points.push(p.slice());
    paint(sctx, current, last ? [last, p] : [p]); // incremental: only the new segment
  }

  const endStroke = () => { current = null; };

  function setColor(i) {
    colorIdx = i % COLORS.length;
    $('swatch').style.background = COLORS[colorIdx];
    $('swatch').style.boxShadow = `0 0 10px ${COLORS[colorIdx]}`;
  }

  // ---------- per-frame logic ----------
  function palmCenter(lm) {
    const ids = [0, 5, 17];
    return [ids.reduce((a, i) => a + lm[i].x, 0) / 3 * W, ids.reduce((a, i) => a + lm[i].y, 0) / 3 * H];
  }

  function onResult({ hands, fps }) {
    overlay.draw(hands); // clears the overlay + draws the skeleton
    $('fps').textContent = `FPS ${fps}`;

    const h = hands[0];
    const g = h ? h.gesture : 'None';
    if (g === cand) candN++; else { cand = g; candN = 1; }
    if (candN >= STABLE_FRAMES && mode !== g) {
      mode = g; endStroke(); smooth = null;
      $('modeBadge').textContent = MODE_LABEL[mode] || (h ? '🖐️ Pick a gesture' : '👋 Show a hand');
    }
    if (!h) { endStroke(); smooth = null; return; }

    const lm = h.landmarks;
    if (mode === 'Pointing_Up' || mode === 'Closed_Fist') {
      const type = mode === 'Pointing_Up' ? 'draw' : 'erase';
      const raw = type === 'draw' ? [lm[8].x * W, lm[8].y * H] : palmCenter(lm);
      smooth = smooth ? [smooth[0] + (raw[0] - smooth[0]) * 0.5, smooth[1] + (raw[1] - smooth[1]) * 0.5] : raw;
      addPoint(type, smooth);
      octx.save(); // cursor ring
      octx.strokeStyle = type === 'draw' ? COLORS[colorIdx] : '#fff';
      octx.lineWidth = 2 * scale;
      octx.beginPath();
      octx.arc(smooth[0], smooth[1], (type === 'draw' ? 12 : 35) * scale, 0, Math.PI * 2);
      octx.stroke();
      octx.restore();
    } else if (mode === 'Victory') {
      const now = performance.now();
      if (now - lastColorAt > COLOR_COOLDOWN) { lastColorAt = now; setColor(colorIdx + 1); }
    }
  }

  // ---------- toolbar ----------
  $('undoBtn').addEventListener('click', () => { strokes.pop(); endStroke(); redraw(); });
  $('clearBtn').addEventListener('click', () => { strokes = []; endStroke(); sctx.clearRect(0, 0, W, H); $('result').hidden = true; });
  $('videoBtn').addEventListener('click', (e) => {
    const off = $('stage').classList.toggle('video-off');
    e.currentTarget.textContent = off ? 'Show video' : 'Hide video';
    e.currentTarget.setAttribute('aria-pressed', String(off));
  });

  /** The drawing on a dark background, flipped like the screen if mirror is on. */
  function exportCanvas(maxW = 0) {
    const k = maxW ? Math.min(1, maxW / W) : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    const x = c.getContext('2d');
    x.fillStyle = '#07060f';
    x.fillRect(0, 0, c.width, c.height);
    if (getSettings().mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(strokesCanvas, 0, 0, c.width, c.height);
    return c;
  }

  const hasDrawing = () => strokes.some((s) => s.type === 'draw' && s.points.length);

  $('saveBtn').addEventListener('click', () => {
    if (!hasDrawing()) return toast('Draw something first.', 'info');
    try {
      const a = document.createElement('a');
      a.href = exportCanvas().toDataURL('image/png');
      a.download = `air-draw-${Date.now()}.png`;
      a.click();
      toast('Saved your drawing.', 'success');
    } catch (err) {
      console.error(err);
      toast('Could not save the image.', 'error');
    }
  });

  $('guessBtn').addEventListener('click', async () => {
    if (!hasDrawing()) return toast('Draw something first, then press AI Guess.', 'info');
    const btn = $('guessBtn'), box = $('result');
    btn.disabled = true;
    box.hidden = false;
    box.innerHTML = '<div class="skeleton" style="height:20px;width:70%"></div><div class="skeleton" style="height:16px;width:90%;margin-top:.6rem"></div>';
    try {
      const { text: reply, demo } = await aiOrDemo(() => askAI([{ role: 'user', content:
        'This is a quick sketch drawn in the air with a finger: neon lines on a dark background. Guess what it shows. ' +
        'Reply in exactly two lines:\nGUESS: <one to four words>\nFACT: <one fun fact about it, under 25 words>' }],
      { image: exportCanvas(768).toDataURL('image/jpeg', 0.85), maxTokens: 120 }),
      () => { const [g, f] = pickGuess(); return `GUESS: ${g}\nFACT: ${f}`; });
      if (!active) return;
      const guess = /GUESS:\s*(.+)/i.exec(reply)?.[1] ?? reply;
      const fact = /FACT:\s*(.+)/i.exec(reply)?.[1];
      box.innerHTML = `<h2>I think you drew: ${esc(guess)}</h2>${demo ? '<p class="hint">Demo answer. Add an API key in <a href="#/settings">Settings</a> for real guesses.</p>' : ''}${fact ? `<p class="muted">💡 ${esc(fact)}</p>` : ''}`;
    } catch (err) {
      if (!active) return;
      box.innerHTML = err instanceof AIError && err.code === 'NO_KEY'
        ? `<p>${NO_KEY_HTML}</p>`
        : `<p class="test-result bad">${esc(err.message || 'The AI could not answer.')}</p>`;
    } finally {
      btn.disabled = false;
    }
  });

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

      W = strokesCanvas.width = overlayCanvas.width = video.videoWidth || 640;
      H = strokesCanvas.height = overlayCanvas.height = video.videoHeight || 480;
      scale = W / 640;
      $('stage').style.setProperty('--ar', W / H);
      applyMirror($('stage'));
      setColor(colorIdx);
      overlay = createOverlay(overlayCanvas, video);
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
  };
}
