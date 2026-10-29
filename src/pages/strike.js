// strike.js — Gesture Strike page: camera setup, full-screen stage, countdown, game-over screen with leaderboard.
import { startCamera, stopCamera } from '../core/camera.js';
import { getTracker } from '../core/handTracker.js';
import { getSettings, shareUrl } from '../core/storage.js';
import { getBoard, qualifies, addScore, boardHtml } from '../core/leaderboard.js';
import { qrSvg } from '../core/qr.js';
import { askAI } from '../core/openrouter.js';
import { isHandControl } from '../core/handControl.js';
import { sfx, isMuted, setMuted } from '../core/sfx.js';
import { iconLabel, muteHtml } from '../core/icons.js';
import { createStrike, DIFFICULTIES } from '../games/strike.js';

const DIFF_KEY = 'gesture-lab:strike-diff';
const NAME_KEY = 'gesture-lab:player-name';
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const rand = (a) => a[Math.floor(Math.random() * a.length)];

export function render(container) {
  container.innerHTML = `
  <section class="page strike-page">
    <video id="video" class="strike-video" playsinline muted></video>
    <h1>Gesture Strike</h1>
    <div class="card strike-intro" id="intro">
      <h2>Defend the base with your bare hands</h2>
      <p class="muted">A full-screen drone-defence shooter. Your fingertip is the crosshair and each gesture is a different weapon.</p>
      <div class="weapon-grid">
        <div><b>☝️ Blaster</b><span>Point to shoot. Any pose you make shoots too.</span></div>
        <div><b>✌️ Flak</b><span>Explosion where you aim. Great against swarms.</span></div>
        <div><b>✊ Rail</b><span>Hold a fist to charge, open your hand to fire a piercing beam.</span></div>
        <div><b>🖐️ Shockwave</b><span>Blast everything near your base. 9 second recharge.</span></div>
        <div><b>🤟 Repair</b><span>Heal the base. 15 second recharge.</span></div>
        <div><b>⭐ 💚</b><span>Shoot floating power-ups to collect them.</span></div>
      </div>
      <div><p class="muted center">Difficulty</p><div class="seg" role="group" aria-label="Difficulty"><button type="button" class="btn ghost diff-btn" data-diff="easy">Easy</button><button type="button" class="btn ghost diff-btn" data-diff="normal">Normal</button><button type="button" class="btn ghost diff-btn" data-diff="hard">Hard</button></div></div>
      <div id="introCam">
        <button class="btn primary" id="enableBtn">Enable camera</button>
        <p id="err" class="test-result bad" role="alert"></p>
      </div>
      <div id="introLoad" hidden><div class="skeleton" style="height:18px;width:60%"></div><p class="muted" id="loadMsg">Loading hand model…</p></div>
      <div id="introReady" hidden>
        <button class="btn primary big" id="playBtn">${iconLabel('play', 'Play full screen', 20)}</button>
        <p class="muted">Stand about an arm's length from the camera with good light. Press Esc to leave.</p>
      </div>
      <div class="card board strike-board-mini"><h3 id="introBoardTitle">🏆 Leaderboard</h3><ol class="board-list" id="introBoard"></ol></div>
    </div>

    <div class="strike-stage" id="sstage" hidden>
      <canvas id="sc"></canvas>
      <button class="btn ghost strike-exit" id="exitBtn" type="button" aria-label="Exit game">${iconLabel('close', 'Exit', 18)}</button>
      <div class="strike-over" id="sover" hidden>
        <div class="card strike-over-card">
          <h2>Mission over</h2>
          <p class="strike-final">Score <b id="finalScore">0</b> · Wave <b id="finalWave">0</b></p>
          <p class="commentary" id="sline" aria-live="polite"></p>
          <div class="board-body">
            <div class="board-main">
              <ol class="board-list" id="overBoard"></ol>
              <form class="name-row" id="nameForm" hidden>
                <input id="nameInput" maxlength="12" placeholder="Your name" aria-label="Your name" autocomplete="off" />
                <button class="btn primary" type="submit">Save score</button>
              </form>
            </div>
            <div class="qr-box" id="qrBox"></div>
          </div>
          <p class="muted">Difficulty</p><div class="seg" role="group" aria-label="Difficulty"><button type="button" class="btn ghost diff-btn" data-diff="easy">Easy</button><button type="button" class="btn ghost diff-btn" data-diff="normal">Normal</button><button type="button" class="btn ghost diff-btn" data-diff="hard">Hard</button></div>
          <div class="toolbar">
            <button class="btn primary" id="againBtn" type="button">Play again</button>
            <button class="btn ghost" id="muteBtn" type="button"></button>
            <button class="btn ghost" id="leaveBtn" type="button">Back to menu</button>
          </div>
        </div>
      </div>
    </div>
  </section>`;

  const $ = (id) => container.querySelector('#' + id);
  const video = $('video'), canvas = $('sc'), gctx = canvas.getContext('2d');
  const tracker = getTracker();
  const env = { W: 1280, H: 720, scale: 720 / 540 };

  let active = true, unsub = null, raf = 0, lastT = 0, inStage = false, cameraOn = false, lineId = 0, pending = null, mirror = true;
  let countdownUntil = 0, hands = [];
  let diff = 'normal';
  try { const d = localStorage.getItem(DIFF_KEY); if (DIFFICULTIES[d]) diff = d; } catch { /* ignore */ }
  const boardKey = (d = diff) => (d === 'normal' ? 'strike' : `strike-${d}`); // each difficulty has its own leaderboard

  // ---------- AI commentary on the game-over card ----------
  async function say(prompt, canned) {
    const el = $('sline'), id = ++lineId;
    el.textContent = rand(canned);
    if (getSettings().apiKey.trim() && !getSettings().demo) {
      try {
        const text = await askAI([
          { role: 'system', content: 'You are a witty arcade commentator. Reply with ONE short funny sentence, max 18 words. No quotes, no emojis.' },
          { role: 'user', content: prompt },
        ], { maxTokens: 60, temperature: 1 });
        const clean = text.split('\n')[0].replace(/^["“']|["”']$/g, '').trim().slice(0, 160);
        if (active && id === lineId && clean) el.textContent = clean;
      } catch (err) { console.warn('Commentator fell back to canned line:', err.message); }
    }
  }

  const game = createStrike(env, { say, over: onOver });

  // ---------- leaderboard ----------
  const paintBoards = (hl = 0) => {
    const html = boardHtml(getBoard(boardKey()), hl);
    $('introBoard').innerHTML = html; $('overBoard').innerHTML = html;
    $('introBoardTitle').textContent = `🏆 Leaderboard · ${DIFFICULTIES[diff].label}`;
    container.querySelectorAll('.diff-btn').forEach((b) => { const on = b.dataset.diff === diff; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  };
  container.querySelectorAll('.diff-btn').forEach((b) => b.addEventListener('click', () => {
    diff = b.dataset.diff; try { localStorage.setItem(DIFF_KEY, diff); } catch { /* ignore */ }
    paintBoards(); sfx.pick();
  }));
  function savePending(name) {
    if (pending == null) return 0;
    const e = addScore(pending.key, name, pending.score);
    pending = null; $('nameForm').hidden = true;
    try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
    return e.date;
  }
  $('nameForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const key = pending?.key, hl = savePending($('nameInput').value);
    if (key) diff = key === 'strike' ? 'normal' : key.slice(7); // show the board the score was saved to
    paintBoards(hl); sfx.good();
  });
  paintBoards();
  try { $('qrBox').innerHTML = `${qrSvg(shareUrl(), { size: 124 })}<span>Scan to play on your phone</span>`; } catch { $('qrBox').hidden = true; }

  // ---------- sizing + drawing ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(320, Math.round(window.innerWidth * dpr)), h = Math.max(240, Math.round(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    env.W = w; env.H = h; env.scale = h / 540;
  }
  window.addEventListener('resize', resize);

  /** Where the camera frame lands on the canvas (object-fit: cover), so the hand skeleton lines up with the picture. */
  function cover() {
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 720, W = canvas.width, H = canvas.height;
    const sc = Math.max(W / vw, H / vh);
    return { vw, vh, sc, dx: (W - vw * sc) / 2, dy: (H - vh * sc) / 2 };
  }
  const mapPt = (lm, c) => [c.dx + (mirror ? 1 - lm.x : lm.x) * c.vw * c.sc, c.dy + lm.y * c.vh * c.sc];

  function drawBackdrop() {
    const W = canvas.width, H = canvas.height, c = cover();
    gctx.fillStyle = '#07060f'; gctx.fillRect(0, 0, W, H);
    if (video.readyState >= 2) {
      gctx.save();
      if (mirror) { gctx.translate(W, 0); gctx.scale(-1, 1); }
      const x = mirror ? W - (c.dx + c.vw * c.sc) : c.dx;
      gctx.drawImage(video, x, c.dy, c.vw * c.sc, c.vh * c.sc);
      gctx.restore();
    }
    gctx.fillStyle = 'rgba(7,6,15,0.58)'; gctx.fillRect(0, 0, W, H);
    const g = gctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(7,6,15,0)'); g.addColorStop(1, 'rgba(7,6,15,0.7)');
    gctx.fillStyle = g; gctx.fillRect(0, 0, W, H);
  }

  function drawSkeleton() {
    const h = hands[0]; if (!h) return;
    const c = cover(), p = h.landmarks.map((l) => mapPt(l, c)), k = env.scale;
    gctx.save(); gctx.lineCap = 'round'; gctx.strokeStyle = 'rgba(25,243,255,0.55)'; gctx.shadowColor = '#19f3ff'; gctx.shadowBlur = 10 * k; gctx.lineWidth = 2.5 * k;
    gctx.beginPath(); BONES.forEach(([a, b]) => { gctx.moveTo(p[a][0], p[a][1]); gctx.lineTo(p[b][0], p[b][1]); }); gctx.stroke();
    gctx.fillStyle = '#ff2fd0'; p.forEach(([x, y]) => { gctx.beginPath(); gctx.arc(x, y, 3.5 * k, 0, Math.PI * 2); gctx.fill(); });
    gctx.restore();
  }

  function drawCountdown(now) {
    const left = countdownUntil - now, k = env.scale;
    const n = Math.floor(left / 800); // 3 · 2 · 1 · GO
    gctx.save(); gctx.fillStyle = '#fff'; gctx.shadowColor = '#ff2fd0'; gctx.shadowBlur = 40 * k; gctx.font = `900 ${150 * k}px sans-serif`; gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
    const text = n >= 1 ? String(n) : 'GO!';
    gctx.fillText(text, env.W / 2, env.H / 2);
    gctx.font = `700 ${24 * k}px sans-serif`; gctx.shadowBlur = 0; gctx.fillStyle = 'rgba(255,255,255,0.85)';
    gctx.fillText('Raise your hand and point at the screen', env.W / 2, env.H / 2 + 110 * k);
    gctx.restore();
    if (text !== drawCountdown.last) { drawCountdown.last = text; sfx.tone(n >= 1 ? 3 - n : 5); }
  }

  let lastDt = 16;
  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(50, t - (lastT || t)); lastT = t; lastDt = dt;
    if (!inStage) return;
    drawBackdrop();
    drawSkeleton();
    if (countdownUntil && t < countdownUntil) { drawCountdown(t); return; }
    if (countdownUntil) { countdownUntil = 0; drawCountdown.last = ''; game.start(diff); }
    game.step(dt);
    game.draw(gctx, t);
  }

  // ---------- tracking ----------
  function onResult({ hands: hs }) {
    hands = hs;
    if (!inStage || !game.isOn()) return;
    const h = hs[0], c = cover();
    const pt = (i) => (h ? mapPt(h.landmarks[i], c) : null);
    game.onHand({ hand: h || null, gesture: h ? h.gesture : 'None', tip: pt(8), palm: pt(9) });
  }

  // ---------- flow ----------
  const show = (id) => ['introCam', 'introLoad', 'introReady'].forEach((k) => { $(k).hidden = k !== id; });

  async function enableCamera() {
    $('err').textContent = ''; $('enableBtn').disabled = true; show('introLoad');
    try {
      await tracker.init(); if (!active) return;
      $('loadMsg').textContent = 'Starting camera…';
      await startCamera(video); if (!active) { stopCamera(video); return; }
      mirror = !!getSettings().mirror;
      unsub = tracker.onResult(onResult);
      tracker.start(video); cameraOn = true;
      raf = requestAnimationFrame(loop);
      show('introReady');
    } catch (err) {
      console.error(err); stopCamera(video);
      if (!active) return;
      show('introCam'); $('enableBtn').disabled = false; $('enableBtn').textContent = 'Try again';
      $('err').textContent = err.message || 'Something went wrong.';
    }
  }

  function setPlaying(on) { document.body.classList.toggle('strike-playing', on); $('exitBtn').hidden = on && isHandControl(); }

  function begin() {
    savePending('Guest');
    $('sover').hidden = true; resize(); lastT = 0;
    countdownUntil = performance.now() + 3200; drawCountdown.last = '';
    setPlaying(true);
  }

  async function enter() {
    mirror = !!getSettings().mirror;
    $('sstage').hidden = false; inStage = true;
    try { await $('sstage').requestFullscreen?.(); } catch { /* the stage still covers the whole window */ }
    begin();
  }

  function leave() {
    game.stop(); inStage = false; countdownUntil = 0; setPlaying(false);
    savePending('Guest'); paintBoards();
    $('sover').hidden = true; $('sstage').hidden = true;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  function onOver(score) {
    setPlaying(false); $('exitBtn').hidden = false;
    $('finalScore').textContent = `${score} (${DIFFICULTIES[diff].label})`; $('finalWave').textContent = game.waveReached?.() ?? '';
    pending = qualifies(boardKey(), score) ? { key: boardKey(), score } : null;
    $('nameForm').hidden = pending == null;
    if (pending != null) { try { $('nameInput').value = localStorage.getItem(NAME_KEY) || ''; } catch { /* ignore */ } }
    paintBoards(); $('sover').hidden = false;
  }

  const paintMute = () => { $('muteBtn').innerHTML = muteHtml(isMuted()); };
  $('muteBtn').addEventListener('click', () => { setMuted(!isMuted()); paintMute(); if (!isMuted()) sfx.pick(); });
  paintMute();

  $('enableBtn').addEventListener('click', enableCamera);
  $('playBtn').addEventListener('click', enter);
  $('againBtn').addEventListener('click', begin);
  $('leaveBtn').addEventListener('click', leave);
  $('exitBtn').addEventListener('click', leave);

  // Esc leaves browser fullscreen -> also leave the game screen
  const onFs = () => { if (!document.fullscreenElement && inStage) leave(); };
  document.addEventListener('fullscreenchange', onFs);
  const onKey = (e) => { if (e.key === 'Escape' && inStage) leave(); };
  document.addEventListener('keydown', onKey);

  navigator.permissions?.query({ name: 'camera' })
    .then((p) => { if (active && p.state === 'granted') enableCamera(); })
    .catch(() => {});

  return () => {
    active = false; game.stop(); cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('fullscreenchange', onFs);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('strike-playing');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    unsub?.(); tracker.stop(); stopCamera(video);
    savePending('Guest');
  };
}
