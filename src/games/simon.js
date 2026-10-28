// simon.js — Copy Cat: watch the gesture pattern, then repeat it from memory. Every round adds one gesture.
import { sfx } from '../core/sfx.js';
import { clamp, pick, drawEmoji } from './util.js';

const POOL = [
  { g: 'Closed_Fist', e: '✊', color: '#ff5c7a' },
  { g: 'Open_Palm', e: '🖐️', color: '#19f3ff' },
  { g: 'Victory', e: '✌️', color: '#b6ff3b' },
  { g: 'Thumb_Up', e: '👍', color: '#ffd23b' },
  { g: 'Pointing_Up', e: '☝️', color: '#ff2fd0' },
  { g: 'ILoveYou', e: '🤟', color: '#9b6bff' },
];
const HOLD_MS = 450;     // how long a gesture must be held to count
const WRONG_MS = 700;    // a different gesture held this long = mistake
const STEP_MS = 5000;    // time allowed for each gesture
const CANNED = [
  'Memory like a goldfish with a gym membership.',
  'Impressive recall. The robot is taking notes.',
  'Your brain and your hands are officially on speaking terms.',
];

export function createSimon(env, api) {
  let on = false, s = null;
  const k = () => env.scale;
  const poolSize = (round) => (round < 4 ? 3 : round < 7 ? 4 : round < 10 ? 5 : 6);

  function reset() {
    s = { seq: [], round: 0, phase: 'idle', t: 0, showIdx: -1, inIdx: 0, hold: 0, wrong: 0, left: STEP_MS, g: 'None', good: 0 };
  }

  function nextRound() {
    s.round++;
    const pool = POOL.slice(0, poolSize(s.round));
    let next;
    do { next = pick(pool); } while (s.seq.length && next === s.seq[s.seq.length - 1] && pool.length > 1);
    s.seq.push(next);
    s.phase = 'show'; s.t = -700; s.showIdx = -1; // short pause before the pattern starts
    api.msg(`Round ${s.round}`);
  }

  function end() {
    on = false; s.phase = 'over';
    const score = s.round - 1;
    api.msg(`Game over · ${score} round${score === 1 ? '' : 's'}`, true);
    sfx.lose();
    api.over(score);
    api.say(`A gesture memory game ended. The player remembered a pattern of ${score} gestures.`, CANNED);
  }

  function step(dt) {
    if (!on || !s) return;
    s.t += dt;
    if (s.phase === 'show') {
      const SHOW = 750, GAP = 250;
      if (s.t >= 0) {
        const idx = Math.floor(s.t / (SHOW + GAP));
        if (idx >= s.seq.length) { s.phase = 'input'; s.inIdx = 0; s.hold = 0; s.wrong = 0; s.left = STEP_MS; api.msg('Your turn!'); }
        else {
          const lit = s.t % (SHOW + GAP) < SHOW;
          if (lit && s.showIdx !== idx) { s.showIdx = idx; sfx.tone(POOL.indexOf(s.seq[idx])); }
          if (!lit) s.showIdx = -1;
        }
      }
    } else if (s.phase === 'input') {
      const want = s.seq[s.inIdx], valid = POOL.some((p) => p.g === s.g);
      s.left -= dt;
      if (s.g === want.g) { s.hold += dt; s.wrong = 0; }
      else { s.hold = Math.max(0, s.hold - dt * 2); if (valid) s.wrong += dt; else s.wrong = Math.max(0, s.wrong - dt); }
      if (s.hold >= HOLD_MS) {
        sfx.tone(POOL.indexOf(want)); s.inIdx++; s.hold = 0; s.wrong = 0; s.left = STEP_MS;
        if (s.inIdx >= s.seq.length) { s.phase = 'between'; s.t = 0; sfx.good(); api.msg('✓ Nice!'); }
      } else if (s.wrong >= WRONG_MS || s.left <= 0) { end(); return; }
    } else if (s.phase === 'between') {
      if (s.t > 1000) nextRound();
    }
    api.hud(`<span class="chip">Round <b>${s.round}</b></span><span class="chip">Pattern length ${s.seq.length}</span>` +
      `<span class="chip ${s.phase === 'input' ? 'ok' : ''}">${s.phase === 'show' ? 'Watch…' : s.phase === 'input' ? 'Your turn' : ' '}</span>`);
  }

  function draw(g, now) {
    if (!s || s.phase === 'idle') return;
    const kk = k(), W = env.W, H = env.H;
    g.fillStyle = 'rgba(7,6,15,0.45)'; g.fillRect(0, 0, W, H);

    if (s.phase === 'show' && s.showIdx >= 0) { // big tile for the pattern
      const p = s.seq[s.showIdx], size = Math.min(W, H) * 0.5;
      g.save(); g.shadowColor = p.color; g.shadowBlur = 40 * kk; g.fillStyle = 'rgba(20,10,50,0.9)'; g.strokeStyle = p.color; g.lineWidth = 6 * kk;
      g.beginPath(); g.roundRect(W / 2 - size / 2, H / 2 - size / 2, size, size, 28 * kk); g.fill(); g.stroke(); g.restore();
      drawEmoji(g, p.e, W / 2, H / 2, size * 0.6);
    }

    // progress row along the bottom: remembered gestures stay hidden until you get them right
    const n = s.seq.length, tile = Math.min(64 * kk, (W - 40 * kk) / n - 8 * kk), gap = 8 * kk;
    const x0 = W / 2 - (n * (tile + gap) - gap) / 2, y = H - tile - 18 * kk;
    s.seq.forEach((p, i) => {
      const x = x0 + i * (tile + gap), done = s.phase === 'input' ? i < s.inIdx : s.phase !== 'show', cur = s.phase === 'input' && i === s.inIdx;
      g.save(); g.fillStyle = 'rgba(20,10,50,0.85)'; g.strokeStyle = done ? '#b6ff3b' : cur ? p.color : 'rgba(255,255,255,0.3)'; g.lineWidth = (cur ? 4 : 2) * kk;
      if (cur) { g.shadowColor = p.color; g.shadowBlur = 14 * kk; }
      g.beginPath(); g.roundRect(x, y, tile, tile, 12 * kk); g.fill(); g.stroke(); g.restore();
      drawEmoji(g, done ? p.e : '❔', x + tile / 2, y + tile / 2, tile * 0.55);
      if (cur) { // hold ring
        g.save(); g.strokeStyle = '#b6ff3b'; g.lineWidth = 5 * kk; g.lineCap = 'round';
        g.beginPath(); g.arc(x + tile / 2, y + tile / 2, tile * 0.62, -Math.PI / 2, -Math.PI / 2 + (clamp(s.hold / HOLD_MS, 0, 1)) * Math.PI * 2); g.stroke(); g.restore();
      }
    });
    if (s.phase === 'input') { // time left for this gesture
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(W * 0.2, 14 * kk, W * 0.6, 6 * kk);
      g.fillStyle = s.left < 1500 ? '#ff5c7a' : '#19f3ff'; g.fillRect(W * 0.2, 14 * kk, W * 0.6 * clamp(s.left / STEP_MS, 0, 1), 6 * kk);
    }
  }

  return {
    title: 'Copy Cat',
    help: 'Watch the gesture pattern, then repeat it from memory. Hold each gesture for half a second. Every round adds one more, and new gestures unlock as you go.',
    start() { api.hideMsg(); reset(); on = true; nextRound(); },
    stop() { on = false; s = null; },
    step, draw,
    onHand({ hand, gesture }) { if (s) s.g = hand ? gesture : 'None'; },
  };
}
