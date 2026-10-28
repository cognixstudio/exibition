// hockey.js — Air Hockey vs the computer. Your index fingertip is the paddle (left half). First to 5 wins.
import { sfx } from '../core/sfx.js';
import { clamp, rnd } from './util.js';

const GOALS_TO_WIN = 5;
const CANNED = {
  win: ['The robot has filed a complaint with the puck.', 'Absolutely dominant. The table is shaking.', 'Champion of the air. Hockey fans, take notes.'],
  lose: ['The machine wins. It will not stop talking about it.', 'So close! Okay, not that close.', 'The puck chose violence, and the robot chose victory.'],
};

export function createHockey(env, api) {
  let on = false, s = null, lastHit = 0;
  const k = () => env.scale;

  function reset() {
    const kk = k();
    s = {
      you: 0, cpu: 0, freeze: 0, t: 0, tip: null, still: 0, aimY: env.H / 2,
      puck: { x: env.W / 2, y: env.H / 2, vx: 0, vy: 0, r: 15 * kk },
      p1: { x: env.W * 0.2, y: env.H / 2, vx: 0, vy: 0, r: 30 * kk },
      p2: { x: env.W * 0.8, y: env.H / 2, vx: 0, vy: 0, r: 30 * kk },
    };
  }

  const goalHalf = () => env.H * 0.19; // half the goal opening height
  const maxPuck = () => 0.85 * k();

  function collide(pad) {
    const p = s.puck, dx = p.x - pad.x, dy = p.y - pad.y, d = Math.hypot(dx, dy), min = p.r + pad.r;
    if (d >= min || d === 0) return;
    const nx = dx / d, ny = dy / d;
    p.x = pad.x + nx * min; p.y = pad.y + ny * min;
    const dot = (p.vx - pad.vx) * nx + (p.vy - pad.vy) * ny;
    if (dot < 0) { p.vx -= 1.9 * dot * nx; p.vy -= 1.9 * dot * ny; }
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > maxPuck()) { p.vx *= maxPuck() / sp; p.vy *= maxPuck() / sp; }
    if (pad === s.p2) s.aimY = env.H / 2 + rnd(-1, 1) * goalHalf() * 1.5; // pick a new target for the next shot
    if (s.t - lastHit > 80) { lastHit = s.t; sfx.hit(); }
  }

  function goal(who) {
    s[who]++; s.freeze = 1100; sfx.goal();
    const you = who === 'you';
    api.msg(you ? 'GOAL! 🎉' : 'Goal for CPU', false);
    s.puck.vx = s.puck.vy = 0;
    s.puck.x = you ? env.W * 0.7 : env.W * 0.3; s.puck.y = env.H / 2; // serve to the side that conceded
    if (s.you >= GOALS_TO_WIN || s.cpu >= GOALS_TO_WIN) end();
  }

  function end() {
    on = false;
    const win = s.you > s.cpu;
    const score = s.you * 10 + (win ? 50 : 0);
    api.msg(win ? `You win ${s.you}–${s.cpu}! 🏆` : `CPU wins ${s.cpu}–${s.you}`, true);
    win ? sfx.good() : sfx.lose();
    api.over(score);
    api.say(`An air hockey game against the computer ended ${s.you} to ${s.cpu}. The player ${win ? 'won' : 'lost'}.`, CANNED[win ? 'win' : 'lose']);
  }

  function movePaddles(dt) {
    const kk = k(), W = env.W, H = env.H;
    // player paddle follows the fingertip
    const p1 = s.p1, ox = p1.x, oy = p1.y;
    if (s.tip) {
      const tx = clamp(s.tip[0], p1.r, W / 2 - p1.r), ty = clamp(s.tip[1], p1.r, H - p1.r);
      const f = Math.min(1, dt * 0.04);
      p1.x += (tx - p1.x) * f; p1.y += (ty - p1.y) * f;
    }
    p1.vx = clamp((p1.x - ox) / dt, -1.3 * kk, 1.3 * kk); p1.vy = clamp((p1.y - oy) / dt, -1.3 * kk, 1.3 * kk);

    // CPU paddle: chase the puck in its half, otherwise guard the goal. It speeds up when you lead.
    const p2 = s.p2, p = s.puck, qx = p2.x, qy = p2.y;
    const speed = clamp(0.36 + 0.04 * s.you - 0.02 * s.cpu, 0.3, 0.62) * kk;
    let tx, ty;
    if (p.x > W / 2 - 10 * kk && Math.hypot(p.vx, p.vy) < 0.9 * kk) {
      // stand behind the puck on the line towards the chosen target, so the hit is aimed
      const ux = -p.x, uy = s.aimY - p.y, ul = Math.hypot(ux, uy) || 1, off = (p2.r + p.r) * 0.85;
      tx = p.x - (ux / ul) * off; ty = p.y - (uy / ul) * off;
    }
    else { tx = W - 70 * kk; ty = H / 2 + (p.y - H / 2) * 0.45; }
    tx = clamp(tx, W / 2 + p2.r, W - p2.r); ty = clamp(ty, p2.r, H - p2.r);
    const dx = tx - p2.x, dy = ty - p2.y, d = Math.hypot(dx, dy) || 1, mv = Math.min(d, speed * dt);
    p2.x += (dx / d) * mv; p2.y += (dy / d) * mv;
    p2.vx = (p2.x - qx) / dt; p2.vy = (p2.y - qy) / dt;
  }

  function step(dt) {
    if (!on || !s) return;
    s.t += dt;
    if (s.freeze > 0) { s.freeze -= dt; return; }
    const W = env.W, H = env.H, p = s.puck, gh = goalHalf();
    // A puck that has stopped (or is pinned in a corner) would freeze the match: move it off the wall and kick it back into play.
    if (Math.hypot(p.vx, p.vy) < 0.02 * k()) {
      s.still += dt;
      const limit = p.x < W / 2 ? 3500 : 1200, away = p.x < W / 2 ? 1 : -1;
      if (s.still > limit) {
        p.x = clamp(p.x, p.r * 3, W - p.r * 3); p.y = clamp(p.y, p.r * 3, H - p.r * 3);
        p.vx = 0.3 * k() * away; p.vy = rnd(-0.15, 0.15) * k(); s.still = 0;
      }
    } else s.still = 0;
    for (let left = dt; left > 0; ) { // sub-steps stop a fast puck tunnelling through a paddle
      const h = Math.min(8, left); left -= h;
      movePaddles(h);
      p.x += p.vx * h; p.y += p.vy * h;
      const f = Math.pow(0.9993, h); p.vx *= f; p.vy *= f;
      if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy) * 0.95; }
      if (p.y > H - p.r) { p.y = H - p.r; p.vy = -Math.abs(p.vy) * 0.95; }
      const inGoal = Math.abs(p.y - H / 2) < gh;
      if (p.x < p.r && !inGoal) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.95; }
      if (p.x > W - p.r && !inGoal) { p.x = W - p.r; p.vx = -Math.abs(p.vx) * 0.95; }
      if (p.x < -p.r * 2) { goal('cpu'); return; }
      if (p.x > W + p.r * 2) { goal('you'); return; }
      collide(s.p1); collide(s.p2);
    }
    api.hud(`<span class="chip">You <b>${s.you}</b></span><span class="chip">CPU <b>${s.cpu}</b></span><span class="chip">First to ${GOALS_TO_WIN}</span>`);
  }

  function draw(g) {
    if (!s) return;
    const kk = k(), W = env.W, H = env.H, gh = goalHalf();
    g.fillStyle = 'rgba(7,6,15,0.38)'; g.fillRect(0, 0, W, H);
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3 * kk; g.setLineDash([10 * kk, 10 * kk]);
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.arc(W / 2, H / 2, 60 * kk, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 8 * kk; g.shadowBlur = 18 * kk;
    g.strokeStyle = '#19f3ff'; g.shadowColor = '#19f3ff'; g.beginPath(); g.moveTo(2, H / 2 - gh); g.lineTo(2, H / 2 + gh); g.stroke();
    g.strokeStyle = '#ff2fd0'; g.shadowColor = '#ff2fd0'; g.beginPath(); g.moveTo(W - 2, H / 2 - gh); g.lineTo(W - 2, H / 2 + gh); g.stroke();
    g.restore();

    const paddle = (pad, color) => {
      g.save(); g.shadowColor = color; g.shadowBlur = 20 * kk; g.fillStyle = 'rgba(20,10,50,0.9)'; g.strokeStyle = color; g.lineWidth = 5 * kk;
      g.beginPath(); g.arc(pad.x, pad.y, pad.r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(pad.x, pad.y, pad.r * 0.4, 0, Math.PI * 2); g.stroke(); g.restore();
    };
    paddle(s.p1, '#19f3ff'); paddle(s.p2, '#ff2fd0');
    g.save(); g.shadowColor = '#fff'; g.shadowBlur = 16 * kk; g.fillStyle = '#fff';
    g.beginPath(); g.arc(s.puck.x, s.puck.y, s.puck.r, 0, Math.PI * 2); g.fill(); g.restore();
    if (on && !s.tip) {
      g.font = `bold ${22 * kk}px sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText('☝️ Point with your index finger', W / 2, H - 24 * kk);
    }
  }

  return {
    title: 'Air Hockey',
    help: 'Move your index fingertip to control the cyan paddle on the left half. Smash the puck into the magenta goal. First to 5 wins.',
    start() { api.hideMsg(); reset(); on = true; },
    stop() { on = false; s = null; },
    step, draw,
    onHand({ tip }) { if (s) s.tip = tip; },
  };
}
