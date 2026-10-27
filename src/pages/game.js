// game.js — Gesture Game: Rock-Paper-Scissors + Fruit Slicer, with an AI commentator.
import { startCamera, stopCamera, applyMirror } from '../core/camera.js';
import { getTracker } from '../core/handTracker.js';
import { createOverlay } from '../core/overlay.js';
import { getSettings } from '../core/storage.js';
import { askAI } from '../core/openrouter.js';

// ---- RPS data
const MOVES = {
  Closed_Fist: { e: '✊', n: 'Rock' },
  Open_Palm: { e: '🖐️', n: 'Paper' },
  Victory: { e: '✌️', n: 'Scissors' },
};
const BEATS = { Closed_Fist: 'Victory', Open_Palm: 'Closed_Fist', Victory: 'Open_Palm' };

// ---- fallback commentary (used when there is no API key or the call fails)
const CANNED = {
  win: ['Flawless victory. The computer is questioning its life choices.', 'Your hand game is unmatched. Respect.', 'Boom! Somebody call the hand-sport authorities.'],
  lose: ['Ouch. The machine is gloating in binary.', 'Brutal. Maybe try your other hand?', 'The computer wins this one. It will not let you forget.'],
  tie: ['A tie! Two minds, one terrible plan.', 'Great minds think alike. So do mediocre ones.', 'Stalemate. Tension you could cut with a fruit knife.'],
  fruit: ['Fruit salad has never been this dramatic.', 'The fruits will remember this.', 'Slice and dice, champion. Round two?'],
};

const FRUITS = ['🍎', '🍉', '🍊', '🍋', '🍇', '🍓', '🥝', '🍍'];
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif';
const BEST_KEY = 'gesture-lab:fruit-best';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a) => a[Math.floor(Math.random() * a.length)];

export function render(container) {
  container.innerHTML = `
  <section class="page">
    <h1>Gesture Game</h1>
    <div class="tabs" role="tablist">
      <button class="tab active" role="tab" data-mode="rps" aria-selected="true">Rock · Paper · Scissors</button>
      <button class="tab" role="tab" data-mode="fruit" aria-selected="false">Fruit Slicer</button>
    </div>

    <div class="card" id="onboard">
      <h2>Turn on your camera</h2>
      <p class="muted">Video stays in your browser. Pick a game, then enable the camera.</p>
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
        <canvas id="game" class="no-flip"></canvas>
        <div class="stage-msg" id="msg" hidden></div>
      </div>

      <div id="rpsPanel">
        <div class="score">
          <div><b id="sYou">0</b><span>You</span></div>
          <div><b id="sTie">0</b><span>Ties</span></div>
          <div><b id="sCpu">0</b><span>Computer</span></div>
        </div>
        <div class="duel">
          <div class="move" id="mvYou">❔</div><div class="vs">VS</div><div class="move" id="mvCpu">❔</div>
        </div>
        <p class="verdict" id="verdict">Press Play, then show ✊ ✋ or ✌️ on "Shoot!"</p>
        <div class="chips"><span class="chip" id="seeing">Your move: —</span></div>
        <div class="toolbar"><button class="btn primary" id="playBtn">Play round</button></div>
      </div>

      <div id="fruitPanel" hidden>
        <div class="chips">
          <span class="chip">Score <b id="fScore">0</b></span>
          <span class="chip" id="fLives">❤️❤️❤️</span>
          <span class="chip">Best <b id="fBest">0</b></span>
        </div>
        <p class="muted center">Slice fruit with your index fingertip. Missed fruit costs a life. Avoid 💣.</p>
        <div class="toolbar"><button class="btn primary" id="fruitBtn">Start</button></div>
      </div>

      <p class="commentary" id="line" aria-live="polite"></p>
    </div>
  </section>`;

  const $ = (id) => container.querySelector('#' + id);
  const video = $('video'), gameCanvas = $('game'), overlayCanvas = $('overlay');
  const gctx = gameCanvas.getContext('2d');
  const tracker = getTracker();

  let active = true, unsub = null, overlay = null, raf = 0, lastT = 0;
  let mode = 'rps', W = 640, H = 480, scale = 1, mirror = true;

  // =============== shared helpers ===============
  function showMsg(text, sticky = false) {
    const m = $('msg');
    m.hidden = false; m.textContent = text;
    m.classList.remove('show'); void m.offsetWidth; m.classList.add('show'); // restart animation
    if (!sticky) clearTimeout(showMsg.t), showMsg.t = setTimeout(() => { m.hidden = true; }, 900);
  }
  const hideMsg = () => { clearTimeout(showMsg.t); $('msg').hidden = true; };

  let lineId = 0;
  /** One funny line from the AI; falls back to canned lines with no key or on any error. */
  async function commentate(prompt, canned) {
    const el = $('line'), id = ++lineId;
    el.textContent = '…';
    let text = '';
    if (getSettings().apiKey.trim() && !getSettings().demo) {
      try {
        text = await askAI([
          { role: 'system', content: 'You are a witty game commentator. Reply with ONE short funny sentence, max 18 words. No quotes, no emojis.' },
          { role: 'user', content: prompt },
        ], { maxTokens: 60, temperature: 1 });
      } catch (err) { console.warn('Commentator fell back to canned line:', err.message); }
    }
    if (!active || id !== lineId) return;
    text = text.split('\n')[0].replace(/^["“']|["”']$/g, '').trim().slice(0, 160);
    el.textContent = text || rand(canned);
  }

  // =============== Rock-Paper-Scissors ===============
  const score = { you: 0, tie: 0, cpu: 0 };
  let busy = false, roundId = 0, sampling = false, samples = [], seenG = '';

  function setMove(id, emoji, cls = '') {
    const el = $(id);
    el.textContent = emoji;
    el.className = 'move ' + cls;
  }

  async function playRound() {
    if (busy || mode !== 'rps') return;
    busy = true;
    const id = ++roundId;
    const alive = () => active && mode === 'rps' && id === roundId;
    $('playBtn').disabled = true;
    setMove('mvYou', '❔'); setMove('mvCpu', '❔');
    $('verdict').textContent = ''; $('line').textContent = '';

    for (const n of ['3', '2', '1']) {
      showMsg(n); await sleep(750);
      if (!alive()) return;
    }
    showMsg('Shoot!');
    samples = []; sampling = true;
    await sleep(700);
    sampling = false;
    if (!alive()) return;

    // Most frequent valid move seen during the window.
    const valid = samples.filter((g) => MOVES[g]);
    if (valid.length < 3) {
      $('verdict').textContent = 'I could not see your move. Hold ✊, 🖐️ or ✌️ steady and try again.';
      busy = false; $('playBtn').disabled = false;
      return;
    }
    const counts = {};
    valid.forEach((g) => { counts[g] = (counts[g] || 0) + 1; });
    const you = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const cpu = rand(Object.keys(MOVES));

    setMove('mvYou', MOVES[you].e, 'pop');
    setMove('mvCpu', '❔', 'shake');
    await sleep(600);
    if (!alive()) return;

    const outcome = you === cpu ? 'tie' : BEATS[you] === cpu ? 'win' : 'lose';
    setMove('mvCpu', MOVES[cpu].e, 'pop ' + (outcome === 'lose' ? 'winner' : outcome === 'win' ? 'loser' : ''));
    $('mvYou').classList.add(outcome === 'win' ? 'winner' : outcome === 'lose' ? 'loser' : 'tied');
    score[outcome === 'win' ? 'you' : outcome === 'lose' ? 'cpu' : 'tie']++;
    $('sYou').textContent = score.you; $('sTie').textContent = score.tie; $('sCpu').textContent = score.cpu;
    $('verdict').textContent = outcome === 'tie'
      ? `Tie! Both threw ${MOVES[you].n}.`
      : outcome === 'win' ? `You win! ${MOVES[you].n} beats ${MOVES[cpu].n}.` : `You lose! ${MOVES[cpu].n} beats ${MOVES[you].n}.`;

    busy = false; $('playBtn').disabled = false;
    commentate(
      `Rock-paper-scissors round. The player threw ${MOVES[you].n}, the computer threw ${MOVES[cpu].n}. ` +
      `Result: ${outcome === 'win' ? 'player wins' : outcome === 'lose' ? 'computer wins' : 'tie'}. Score: player ${score.you}, computer ${score.cpu}.`,
      CANNED[outcome]);
  }
  $('playBtn').addEventListener('click', playRound);

  // =============== Fruit Slicer ===============
  let running = false, fScore = 0, lives = 3, best = 0, spawnTimer = 0, flash = 0;
  let fruits = [], halves = [], parts = [], pops = [], trail = [], tip = null;
  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch { /* storage blocked */ }
  $('fBest').textContent = best;

  const gravity = () => H * 1.4e-6; // px per ms²

  function spawnFruit() {
    const bomb = fScore >= 5 && Math.random() < 0.12;
    const r = 34 * scale, g = gravity();
    const x = W * (0.12 + Math.random() * 0.76);
    const vy = -Math.sqrt(2 * g * H * (0.5 + Math.random() * 0.35)); // random apex height
    const tUp = -vy / g;
    const vx = (W * (0.1 + Math.random() * 0.8) - x) / (2 * tUp);    // arc toward a random x
    fruits.push({ x, y: H + r, vx, vy, r, rot: 0, spin: (Math.random() - 0.5) * 0.006, emoji: bomb ? '💣' : rand(FRUITS), bomb });
  }

  function updateHud() {
    $('fScore').textContent = fScore;
    $('fLives').textContent = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 3 - lives));
  }

  function burst(x, y, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.1 + Math.random() * 0.25) * scale;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 450, color });
    }
  }

  function loseLife() {
    lives--; flash = 1; updateHud();
    if (lives <= 0) gameOver();
  }

  function gameOver() {
    running = false;
    if (fScore > best) {
      best = fScore; $('fBest').textContent = best;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* ignore */ }
    }
    showMsg(`Game over · ${fScore}`, true);
    $('fruitBtn').textContent = 'Play again';
    commentate(`A fruit-slicing game just ended. The player sliced ${fScore} fruits. Their best is ${best}.`, CANNED.fruit);
  }

  function startFruit() {
    fruits = []; halves = []; parts = []; pops = [];
    fScore = 0; lives = 3; spawnTimer = 500; running = true;
    $('line').textContent = ''; hideMsg(); updateHud();
    $('fruitBtn').textContent = 'Restart';
  }
  $('fruitBtn').addEventListener('click', startFruit);

  function sliceFruit(f) {
    f.dead = true;
    if (f.bomb) {
      burst(f.x, f.y, '#ff5c7a', 14);
      pops.push({ x: f.x, y: f.y, text: '💥', life: 700 });
      loseLife();
      return;
    }
    fScore++; updateHud();
    for (const side of [-1, 1]) {
      halves.push({ emoji: f.emoji, x: f.x, y: f.y, r: f.r, rot: f.rot, spin: side * 0.004, vx: f.vx + side * 0.12 * scale, vy: f.vy - 0.05, side, life: 700 });
    }
    burst(f.x, f.y, '#b6ff3b');
    pops.push({ x: f.x, y: f.y, text: '+1', life: 600 });
  }

  function distToSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }

  function trySlice(a, b) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!running || len < 6 * scale || len > W * 0.5) return; // ignore resting finger and tracker jumps
    fruits.forEach((f) => { if (!f.dead && distToSeg(f.x, f.y, a, b) <= f.r) sliceFruit(f); });
  }

  function step(dt) {
    if (running) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnFruit();
        if (Math.random() < Math.min(0.35, fScore * 0.01)) spawnFruit();
        spawnTimer = Math.max(450, 1100 - fScore * 18) * (0.8 + Math.random() * 0.4);
      }
    }
    const g = gravity();
    for (const f of fruits) {
      f.vy += g * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.spin * dt;
      if (f.y > H + f.r * 1.5 && f.vy > 0) { f.dead = true; if (running && !f.bomb) loseLife(); }
    }
    fruits = fruits.filter((f) => !f.dead);
    for (const h of halves) { h.vy += g * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.spin * dt; h.life -= dt; }
    halves = halves.filter((h) => h.life > 0);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    for (const p of pops) { p.y -= 0.05 * dt * scale; p.life -= dt; }
    pops = pops.filter((p) => p.life > 0);
    flash = Math.max(0, flash - dt / 400);
  }

  function drawEmoji(emoji, r) {
    gctx.font = `${r * 2}px ${EMOJI_FONT}`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
    gctx.fillText(emoji, 0, 0);
  }

  function draw(now) {
    gctx.clearRect(0, 0, W, H);
    if (mode !== 'fruit') return;
    for (const f of fruits) {
      gctx.save(); gctx.translate(f.x, f.y); gctx.rotate(f.rot); drawEmoji(f.emoji, f.r); gctx.restore();
    }
    for (const h of halves) {
      gctx.save(); gctx.globalAlpha = Math.max(0, h.life / 700);
      gctx.translate(h.x, h.y); gctx.rotate(h.rot);
      gctx.beginPath(); gctx.rect(h.side < 0 ? -h.r : 0, -h.r, h.r, h.r * 2); gctx.clip();
      drawEmoji(h.emoji, h.r); gctx.restore();
    }
    for (const p of parts) {
      gctx.globalAlpha = Math.max(0, p.life / 450); gctx.fillStyle = p.color;
      gctx.beginPath(); gctx.arc(p.x, p.y, 3 * scale, 0, Math.PI * 2); gctx.fill();
    }
    gctx.globalAlpha = 1;
    for (const p of pops) {
      gctx.globalAlpha = Math.max(0, p.life / 600);
      gctx.font = `bold ${26 * scale}px ${EMOJI_FONT}`; gctx.textAlign = 'center'; gctx.fillStyle = '#fff';
      gctx.fillText(p.text, p.x, p.y);
    }
    gctx.globalAlpha = 1;
    // finger trail (last ~220 ms)
    trail = trail.filter((t) => now - t.t < 220);
    if (trail.length > 1) {
      gctx.save(); gctx.lineCap = 'round'; gctx.strokeStyle = '#19f3ff'; gctx.shadowColor = '#19f3ff'; gctx.shadowBlur = 16 * scale;
      for (let i = 1; i < trail.length; i++) {
        gctx.lineWidth = (2 + (i / trail.length) * 6) * scale;
        gctx.beginPath(); gctx.moveTo(trail[i - 1].x, trail[i - 1].y); gctx.lineTo(trail[i].x, trail[i].y); gctx.stroke();
      }
      gctx.restore();
    }
    if (flash > 0) { gctx.fillStyle = `rgba(255,40,80,${flash * 0.35})`; gctx.fillRect(0, 0, W, H); }
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(50, t - (lastT || t)); lastT = t;
    if (mode === 'fruit') step(dt);
    draw(t);
  }

  // =============== tracking callback ===============
  function onResult({ hands }) {
    overlay.draw(hands);
    const h = hands[0], g = h ? h.gesture : 'None';
    if (g !== seenG) {
      seenG = g;
      $('seeing').textContent = `Your move: ${MOVES[g] ? `${MOVES[g].e} ${MOVES[g].n}` : '—'}`;
    }
    if (sampling && h) samples.push(g);

    if (mode === 'fruit') {
      if (!h) { tip = null; return; }
      const p = [(mirror ? 1 - h.landmarks[8].x : h.landmarks[8].x) * W, h.landmarks[8].y * H];
      if (tip) trySlice(tip, p);
      tip = p;
      trail.push({ x: p[0], y: p[1], t: performance.now() });
    }
  }

  // =============== mode tabs ===============
  function setMode(m) {
    mode = m;
    container.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.mode === m;
      t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on));
    });
    $('rpsPanel').hidden = m !== 'rps';
    $('fruitPanel').hidden = m !== 'fruit';
    roundId++; busy = false; sampling = false; running = false; tip = null; trail = [];
    fruits = []; halves = []; parts = []; pops = [];
    $('playBtn').disabled = false; $('fruitBtn').textContent = 'Start';
    hideMsg(); $('line').textContent = ''; lineId++;
  }
  container.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  // =============== start / stop ===============
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

      W = gameCanvas.width = overlayCanvas.width = video.videoWidth || 640;
      H = gameCanvas.height = overlayCanvas.height = video.videoHeight || 480;
      scale = W / 640;
      mirror = !!getSettings().mirror;
      $('stage').style.setProperty('--ar', W / H);
      applyMirror($('stage'));
      overlay = createOverlay(overlayCanvas, video);
      unsub = tracker.onResult(onResult);
      tracker.start(video);
      raf = requestAnimationFrame(loop);
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
    roundId++;
    cancelAnimationFrame(raf);
    clearTimeout(showMsg.t);
    unsub?.();
    tracker.stop();
    stopCamera(video);
  };
}
