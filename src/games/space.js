// space.js — Space Defender: steer with your palm, switch powers with gestures.
//   palm position = move · ☝️/any = auto-fire · ✊ = rapid fire · 🖐️ = shield (no shooting) · ✌️ = bomb
import { sfx } from '../core/sfx.js';
import { clamp, rnd, pick, drawEmoji } from './util.js';

const FOES = {
  grunt: { e: '👾', hp: 1, vy: 0.07, pts: 10, shoots: 0 },
  fast: { e: '🛸', hp: 1, vy: 0.14, pts: 20, shoots: 0 },
  tank: { e: '👽', hp: 3, vy: 0.05, pts: 40, shoots: 2400 },
};
const CANNED = [
  'The galaxy is safer, and slightly more embarrassed.',
  'Pilot down. The aliens are doing a victory dance.',
  'That was a heroic last stand. Mostly the "last" part.',
];

export function createSpace(env, api) {
  let on = false, s = null;
  const k = () => env.scale;
  const shipY = () => env.H - 46 * k();

  function reset() {
    s = {
      x: env.W / 2, tx: env.W / 2, hand: false, g: 'None', pg: 'None',
      lives: 3, score: 0, kills: 0, level: 1, bombs: 1, shield: 1, shieldOn: false,
      cool: 0, power: 0, inv: 0, flash: 0, spawn: 900, nextBoss: 20, boss: null, t: 0,
      bullets: [], foes: [], shots: [], items: [], parts: [], pops: [],
    };
  }

  const burst = (x, y, color, n = 10) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.08 + Math.random() * 0.22) * k();
      s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 500, color });
    }
  };
  const pop = (x, y, text) => s.pops.push({ x, y, text, life: 700 });

  function fire() {
    const x = s.x, y = shipY() - 18 * k(), v = 0.75 * k();
    const angles = s.power > 0 ? [-0.09, 0, 0.09] : [0];
    angles.forEach((vx) => s.bullets.push({ x, y, vx: vx * k(), vy: -v, r: 4 * k() }));
    sfx.shoot();
  }

  function spawnFoe() {
    const r = Math.random();
    const type = s.level >= 3 && r < 0.2 ? 'tank' : s.level >= 2 && r < 0.4 ? 'fast' : 'grunt';
    const d = FOES[type], x0 = rnd(50 * k(), env.W - 50 * k());
    s.foes.push({
      type, e: d.e, hp: d.hp, max: d.hp, pts: d.pts, x: x0, x0, y: -30 * k(),
      vy: d.vy * k() * (1 + 0.1 * (s.level - 1)), ph: rnd(0, 6.28), amp: rnd(0, 60 * k()),
      shoot: d.shoots ? rnd(600, d.shoots) : 0, shootEvery: d.shoots, r: 22 * k(),
    });
  }

  function spawnBoss() {
    const hp = 30 + s.level * 12;
    s.boss = { boss: true, e: '👹', hp, max: hp, pts: 300, x: env.W / 2, y: 80 * k(), r: 46 * k(), dir: 1, shoot: 1000 };
    s.foes.push(s.boss);
    api.msg('⚠️ BOSS', false);
    sfx.bad();
  }

  function hurt() {
    if (s.inv > 0) return;
    s.lives--; s.inv = 1500; s.flash = 1; sfx.bad();
    burst(s.x, shipY(), '#ff5c7a', 14);
    if (s.lives <= 0) end();
  }

  function kill(f) {
    f.dead = true;
    s.score += f.pts; s.kills++;
    burst(f.x, f.y, f.boss ? '#ffd23b' : '#b6ff3b', f.boss ? 40 : 12);
    pop(f.x, f.y, '+' + f.pts); sfx.boom();
    if (s.kills % 12 === 0 && s.bombs < 3) { s.bombs++; pop(s.x, shipY() - 40 * k(), '+💣'); }
    if (f.boss) {
      s.boss = null; s.level++; s.nextBoss = s.kills + 20 + s.level * 3;
      s.items.push({ x: f.x, y: f.y, vy: 0.09 * k(), t: 'life', e: '❤️' });
      api.msg(`Level ${s.level}`);
      api.say(`A space shooter player just defeated a boss and reached level ${s.level} with ${s.score} points.`, CANNED);
    } else if (Math.random() < 0.13) {
      const t = pick(['power', 'life', 'shield']);
      s.items.push({ x: f.x, y: f.y, vy: 0.09 * k(), t, e: t === 'power' ? '⭐' : t === 'life' ? '❤️' : '🔋' });
    }
  }

  function bomb() {
    s.bombs--; s.flash = 1; sfx.boom();
    for (const f of s.foes) {
      if (f.dead) continue;
      if (f.boss) { f.hp -= 12; burst(f.x, f.y, '#ffd23b', 16); if (f.hp <= 0) kill(f); } else kill(f);
    }
    s.shots = [];
    api.msg('💥', false);
  }

  function end() {
    on = false;
    api.msg(`Game over · ${s.score}`, true);
    sfx.lose();
    api.over(s.score);
    api.say(`A space shooter game just ended. The player scored ${s.score} and reached level ${s.level}.`, CANNED);
  }

  const hit = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;

  function step(dt) {
    if (!on || !s) return;
    const kk = k(), W = env.W, H = env.H, sy = shipY();
    s.t += dt;
    s.x = clamp(s.x + (s.tx - s.x) * Math.min(1, dt * 0.018), 20 * kk, W - 20 * kk);

    s.shieldOn = s.hand && s.g === 'Open_Palm' && s.shield > 0.04;
    s.shield = clamp(s.shield + (s.shieldOn ? -0.00032 : 0.00016) * dt, 0, 1);
    s.cool -= dt; s.inv = Math.max(0, s.inv - dt); s.power = Math.max(0, s.power - dt);
    s.flash = Math.max(0, s.flash - dt / 400);

    if (s.hand && !s.shieldOn && s.cool <= 0) { s.cool = s.g === 'Closed_Fist' ? 120 : 340; fire(); }
    if (s.hand && s.g === 'Victory' && s.pg !== 'Victory' && s.bombs > 0) bomb();
    s.pg = s.g;

    if (!s.boss) {
      s.spawn -= dt;
      if (s.spawn <= 0) { spawnFoe(); s.spawn = Math.max(280, 950 - s.level * 70 - s.kills * 3) * rnd(0.8, 1.2); }
      if (s.kills >= s.nextBoss) spawnBoss();
    }

    for (const b of s.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.y < -10 || b.x < -10 || b.x > W + 10) b.dead = true; }

    for (const f of s.foes) {
      if (f.dead) continue;
      if (f.boss) {
        f.x += f.dir * 0.09 * kk * dt;
        if (f.x > W - 70 * kk) f.dir = -1; else if (f.x < 70 * kk) f.dir = 1;
        f.shoot -= dt;
        if (f.shoot <= 0) {
          f.shoot = Math.max(550, 1200 - s.level * 80);
          for (const vx of [-0.07, 0, 0.07]) s.shots.push({ x: f.x, y: f.y + f.r, vx: vx * kk, vy: 0.2 * kk, r: 6 * kk });
        }
      } else {
        f.y += f.vy * dt;
        f.x = clamp(f.x0 + Math.sin(s.t * 0.002 + f.ph) * f.amp, 20 * kk, W - 20 * kk);
        if (f.shootEvery) {
          f.shoot -= dt;
          if (f.shoot <= 0) { f.shoot = f.shootEvery; s.shots.push({ x: f.x, y: f.y + f.r, vx: 0, vy: 0.2 * kk, r: 6 * kk }); }
        }
        if (f.y > H + f.r) { f.dead = true; s.lives--; s.flash = 1; sfx.bad(); if (s.lives <= 0) { end(); return; } continue; }
        if (hit(f, { x: s.x, y: sy }, f.r + 16 * kk)) {
          f.dead = true;
          if (s.shieldOn) { kill(f); } else { burst(f.x, f.y, '#ff5c7a'); hurt(); if (!on) return; }
        }
      }
    }

    for (const b of s.bullets) {
      if (b.dead) continue;
      for (const f of s.foes) {
        if (f.dead || !hit(b, f, f.r + b.r)) continue;
        b.dead = true; f.hp--; sfx.hit(); burst(b.x, b.y, '#19f3ff', 3);
        if (f.hp <= 0) kill(f);
        break;
      }
    }

    for (const e of s.shots) {
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.y > H + 10 || e.x < -10 || e.x > W + 10) { e.dead = true; continue; }
      if (hit(e, { x: s.x, y: sy }, e.r + 16 * kk)) {
        e.dead = true;
        if (s.shieldOn) { s.shield = Math.max(0, s.shield - 0.08); burst(e.x, e.y, '#19f3ff', 5); sfx.hit(); }
        else { hurt(); if (!on) return; }
      }
    }

    for (const it of s.items) {
      it.y += it.vy * dt;
      if (it.y > H + 20) { it.dead = true; continue; }
      if (hit(it, { x: s.x, y: sy }, 30 * kk)) {
        it.dead = true; sfx.pick();
        if (it.t === 'power') { s.power = 8000; pop(it.x, it.y, 'Triple shot!'); }
        else if (it.t === 'life') { s.lives = Math.min(5, s.lives + 1); pop(it.x, it.y, '+1 ❤️'); }
        else { s.shield = 1; pop(it.x, it.y, 'Shield full'); }
      }
    }

    for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (const p of s.pops) { p.y -= 0.05 * dt * kk; p.life -= dt; }
    s.bullets = s.bullets.filter((o) => !o.dead);
    s.foes = s.foes.filter((o) => !o.dead);
    s.shots = s.shots.filter((o) => !o.dead);
    s.items = s.items.filter((o) => !o.dead);
    s.parts = s.parts.filter((o) => o.life > 0);
    s.pops = s.pops.filter((o) => o.life > 0);

    api.hud(
      `<span class="chip">Score <b>${s.score}</b></span><span class="chip">Level ${s.level}</span>` +
      `<span class="chip">${'❤️'.repeat(Math.max(0, s.lives))}</span><span class="chip">💣 ${s.bombs}</span>` +
      `<span class="chip ${s.shield > 0.3 ? 'ok' : ''}">🛡️ ${Math.round(s.shield * 20) * 5}%</span>` +
      (s.power > 0 ? '<span class="chip ok">⭐ Triple shot</span>' : ''));
  }

  function draw(g) {
    if (!s) return;
    const kk = k(), sy = shipY();
    for (const f of s.foes) {
      drawEmoji(g, f.e, f.x, f.y, f.r * 2);
      if (f.max > 1) { // health bar
        const w = f.r * 2, x = f.x - w / 2, y = f.y - f.r - 8 * kk;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y, w, 4 * kk);
        g.fillStyle = f.boss ? '#ffd23b' : '#b6ff3b'; g.fillRect(x, y, w * Math.max(0, f.hp / f.max), 4 * kk);
      }
    }
    for (const it of s.items) drawEmoji(g, it.e, it.x, it.y, 34 * kk);

    g.save(); g.lineCap = 'round'; g.strokeStyle = '#19f3ff'; g.shadowColor = '#19f3ff'; g.shadowBlur = 10 * kk; g.lineWidth = 4 * kk;
    for (const b of s.bullets) { g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 40, b.y - b.vy * 40); g.stroke(); }
    g.restore();
    g.save(); g.fillStyle = '#ff2fd0'; g.shadowColor = '#ff2fd0'; g.shadowBlur = 12 * kk;
    for (const e of s.shots) { g.beginPath(); g.arc(e.x, e.y, e.r, 0, Math.PI * 2); g.fill(); }
    g.restore();

    // ship (blinks while invulnerable)
    if (s.inv <= 0 || Math.floor(s.t / 90) % 2 === 0) {
      g.save(); g.translate(s.x, sy);
      g.fillStyle = 'rgba(20,10,50,0.85)'; g.strokeStyle = '#19f3ff'; g.shadowColor = '#19f3ff'; g.shadowBlur = 16 * kk; g.lineWidth = 3 * kk;
      g.beginPath(); g.moveTo(0, -22 * kk); g.lineTo(17 * kk, 16 * kk); g.lineTo(0, 8 * kk); g.lineTo(-17 * kk, 16 * kk); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    if (s.shieldOn) {
      g.save(); g.strokeStyle = `rgba(25,243,255,${0.45 + 0.3 * Math.sin(s.t / 80)})`; g.lineWidth = 5 * kk; g.shadowColor = '#19f3ff'; g.shadowBlur = 18 * kk;
      g.beginPath(); g.arc(s.x, sy, 34 * kk, 0, Math.PI * 2); g.stroke(); g.restore();
    }

    for (const p of s.parts) { g.globalAlpha = clamp(p.life / 500, 0, 1); g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, 3 * kk, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    g.fillStyle = '#fff';
    for (const p of s.pops) { g.globalAlpha = clamp(p.life / 700, 0, 1); g.font = `bold ${22 * kk}px sans-serif`; g.textAlign = 'center'; g.fillText(p.text, p.x, p.y); }
    g.globalAlpha = 1;

    if (on && !s.hand) {
      g.font = `bold ${22 * kk}px sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText('✋ Show your hand to fly', env.W / 2, env.H / 2);
    }
    if (s.flash > 0) { g.fillStyle = `rgba(255,40,80,${s.flash * 0.3})`; g.fillRect(0, 0, env.W, env.H); }
  }

  return {
    title: 'Space Defender',
    help: 'Move your palm left/right to fly · auto-fire · ✊ rapid fire · 🖐️ shield (can’t shoot) · ✌️ bomb. Grab ⭐ ❤️ 🔋 and beat the boss.',
    start() { api.hideMsg(); reset(); on = true; },
    stop() { on = false; s = null; },
    step, draw,
    onHand({ hand, gesture, palm }) {
      if (!s) return;
      s.hand = !!hand; s.g = hand ? gesture : 'None';
      if (palm) s.tx = palm[0];
    },
  };
}
