// strike.js — Gesture Strike: full-screen drone-defence shooter. Your fingertip is the crosshair, gestures switch weapons.
//   ☝️ (or any other pose) = BLASTER   ✌️ = FLAK burst   ✊ hold + release = RAIL beam   🖐️ = SHOCKWAVE   🤟 = REPAIR
// Pure game logic + canvas drawing, no DOM: the page feeds it hand data and gives it a canvas context.
import { sfx } from '../core/sfx.js';
import { clamp, rnd, drawEmoji } from './util.js';

const TYPES = {
  drone: { e: '🛸', hp: 2, speed: 80, r: 26, dmg: 10, pts: 100 },
  swarm: { e: '👾', hp: 1, speed: 150, r: 18, dmg: 5, pts: 50 },
  gunship: { e: '🚁', hp: 6, speed: 55, r: 34, dmg: 15, pts: 300, shoots: 2300 },
  meteor: { e: '☄️', hp: 9, speed: 48, r: 46, dmg: 25, pts: 250 },
};
const WEAPONS = [
  { id: 'blaster', e: '☝️', name: 'BLASTER', color: '#19f3ff' },
  { id: 'flak', e: '✌️', name: 'FLAK', color: '#ffd23b' },
  { id: 'rail', e: '✊', name: 'RAIL', color: '#ff2fd0' },
  { id: 'shock', e: '🖐️', name: 'SHOCK', color: '#b6ff3b' },
  { id: 'repair', e: '🤟', name: 'REPAIR', color: '#9b6bff' },
];
const SHOCK_CD = 9000, REPAIR_CD = 15000, FLAK_CD = 850, CHARGE_MS = 1200, PAUSE_AFTER = 1500, ABANDON_AFTER = 25000;
const CANNED = [
  'The drones are filing a complaint about excessive hand gestures.',
  'Base lost, pride intact, and the aliens are now eating your snacks.',
  'A heroic stand! The robots will tell their grandchildren.',
];

export const DIFFICULTIES = {
  easy: { label: 'Easy', speed: 0.8, spawn: 1.3, dmg: 0.6, boss: 0.7 },
  normal: { label: 'Normal', speed: 1, spawn: 1, dmg: 1, boss: 1 },
  hard: { label: 'Hard', speed: 1.25, spawn: 0.75, dmg: 1.5, boss: 1.4 },
};

export const weaponFor = (g) => (g === 'Victory' ? 'flak' : g === 'Closed_Fist' ? 'rail' : g === 'Open_Palm' ? 'shock' : g === 'ILoveYou' ? 'repair' : 'blaster');

export function createStrike(env, api) {
  let on = false, s = null;
  const k = () => env.scale;
  const base = () => ({ x: env.W / 2, y: env.H - 34 * k() });

  function reset(level) {
    const b = base();
    s = {
      diff: DIFFICULTIES[level] || DIFFICULTIES.normal,
      hp: 100, score: 0, kills: 0, wave: 0, phase: 'break', breakT: 1200, queue: [], spawnT: 0,
      enemies: [], shots: [], items: [], tracers: [], rings: [], beams: [], parts: [], pops: [], banner: null,
      combo: 0, comboT: 0, power: 0, flash: 0, t: 0,
      hand: false, g: 'None', pg: 'None', tx: b.x, ty: env.H / 2, ax: b.x, ay: env.H / 2, fx: b.x, fy: env.H / 2,
      cool: 0, flakCd: 0, shockCd: 0, repairCd: 0, charge: 0, noHand: 0, pausedTotal: 0, paused: false, onTarget: false,
    };
  }

  // ---------- small helpers ----------
  const mult = () => Math.min(5, 1 + Math.floor(s.combo / 6));
  const dmgMul = () => (s.power > 0 ? 2 : 1);
  const pop = (x, y, text, color = '#fff') => s.pops.push({ x, y, text, color, life: 800 });
  const banner = (text, ms = 1600) => { s.banner = { text, life: ms, max: ms }; };
  function burst(x, y, color, n = 10, speed = 0.25) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.06 + Math.random() * speed) * k();
      s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 450 + Math.random() * 250, color });
    }
  }
  const distSeg = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };
  /** Everything that can be shot: enemies, enemy projectiles and pick-ups. */
  const targets = () => [...s.enemies, ...s.shots, ...s.items].filter((t) => !t.dead);

  // ---------- damage / kills ----------
  function hurtBase(dmg) {
    s.hp = Math.max(0, s.hp - Math.max(1, Math.round(dmg * s.diff.dmg))); s.flash = 1; s.combo = 0; sfx.bad();
    const b = base(); burst(b.x, b.y - 20 * k(), '#ff5c7a', 16);
    if (s.hp <= 0) end();
  }

  function collect(it) {
    it.dead = true; sfx.pick(); burst(it.x, it.y, '#ffd23b', 12);
    if (it.type === 'power') { s.power = 8000; pop(it.x, it.y, '2× DAMAGE', '#ffd23b'); }
    else { s.hp = Math.min(100, s.hp + 12); pop(it.x, it.y, '+12 HP', '#b6ff3b'); }
  }

  function kill(e) {
    e.dead = true; s.kills++; s.combo++; s.comboT = 2200;
    const pts = e.pts * mult();
    s.score += pts;
    burst(e.x, e.y, e.boss ? '#ffd23b' : '#ff9d3b', e.boss ? 60 : 14);
    pop(e.x, e.y, `+${pts}`, mult() > 1 ? '#ffd23b' : '#fff');
    sfx.boom();
    if (e.boss) {
      s.hp = Math.min(100, s.hp + 30); banner('BOSS DESTROYED', 2200);
      api.say(`A drone-defence game: the player just destroyed a giant boss robot on wave ${s.wave} with a score of ${s.score}.`, CANNED);
    } else if (Math.random() < 0.1) {
      const type = Math.random() < 0.5 ? 'power' : 'heal';
      s.items.push({ type, e: type === 'power' ? '⭐' : '💚', x: e.x, y: e.y, r: 26 * k(), life: 8000, item: true });
    }
  }

  function damage(t, d) {
    if (t.dead) return;
    if (t.item) { collect(t); return; }
    if (t.proj) { t.dead = true; burst(t.x, t.y, '#ff2fd0', 8); return; }
    t.hp -= d; t.flash = 90; sfx.hit();
    if (t.hp <= 0) kill(t);
  }

  // ---------- weapons ----------
  function fireBlaster() {
    const b = base(), assist = 18 * k();
    let best = null, bd = Infinity;
    for (const t of targets()) {
      const d = Math.hypot(t.x - s.ax, t.y - s.ay) - (t.r || 0);
      if (d < assist && d < bd) { bd = d; best = t; }
    }
    s.tracers.push({ x1: b.x, y1: b.y - 20 * k(), x2: best ? best.x : s.ax, y2: best ? best.y : s.ay, life: 90 });
    sfx.shoot();
    if (best) { burst(best.x, best.y, '#19f3ff', 4, 0.15); damage(best, dmgMul()); }
  }

  function fireFlak() {
    const R = 95 * k();
    s.rings.push({ x: s.ax, y: s.ay, r: 10 * k(), max: R, life: 350, maxLife: 350, color: '#ffd23b' });
    burst(s.ax, s.ay, '#ffd23b', 16);
    sfx.boom();
    for (const t of targets()) if (Math.hypot(t.x - s.ax, t.y - s.ay) <= R + (t.r || 0)) damage(t, 3 * dmgMul());
  }

  function fireRail(x, y, charge) {
    const b = base(), sx = b.x, sy = b.y - 20 * k();
    let dx = x - sx, dy = y - sy; const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const far = Math.hypot(env.W, env.H) * 1.2, ex = sx + dx * far, ey = sy + dy * far;
    const width = (10 + charge * 34) * k(), dmg = Math.ceil(charge * 8) * dmgMul();
    s.beams.push({ x1: sx, y1: sy, x2: ex, y2: ey, w: width, life: 320, maxLife: 320 });
    sfx.boom();
    for (const t of targets()) if (distSeg(t.x, t.y, sx, sy, ex, ey) <= (t.r || 0) + width / 2) damage(t, dmg);
    pop(x, y, `RAIL ×${dmg}`, '#ff2fd0');
  }

  function shock() {
    const b = base(), R = env.H * 0.6;
    s.shockCd = SHOCK_CD; s.flash = Math.max(s.flash, 0.25);
    s.rings.push({ x: b.x, y: b.y, r: 20 * k(), max: R, life: 600, maxLife: 600, color: '#b6ff3b', thick: 10 });
    sfx.boom();
    for (const t of targets()) if (Math.hypot(t.x - b.x, t.y - b.y) <= R + (t.r || 0)) damage(t, t.boss ? 15 : 4);
    for (const p of s.shots) { if (!p.dead) { p.dead = true; burst(p.x, p.y, '#b6ff3b', 5); } }
  }

  function repair() {
    s.repairCd = REPAIR_CD; s.hp = Math.min(100, s.hp + 25);
    const b = base(); pop(b.x, b.y - 80 * k(), '+25 HP', '#b6ff3b'); sfx.good();
  }

  // ---------- waves ----------
  function buildQueue(w) {
    const q = [], n = 5 + w * 3;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (w >= 2 && r < 0.22) { for (let j = 0; j < 4; j++) q.push('swarm'); }
      else if (w >= 3 && r > 0.9) q.push('gunship');
      else if (w >= 4 && r > 0.82) q.push('meteor');
      else q.push('drone');
    }
    if (w % 5 === 0) q.push('boss');
    return q;
  }

  function startWave() {
    s.wave++; s.phase = 'wave'; s.queue = buildQueue(s.wave); s.spawnT = 300;
    banner(s.wave % 5 === 0 ? `WAVE ${s.wave} · BOSS` : `WAVE ${s.wave}`);
    sfx.tone(s.wave % 6);
  }

  /** Build one regular enemy at (x, y). */
  function mkEnemy(type, x, y) {
    const d = TYPES[type], kk = k(), sm = (1 + 0.06 * (s.wave - 1)) * s.diff.speed;
    return {
      type, e: d.e, hp: d.hp, max: d.hp, x, y, r: d.r * kk, speed: d.speed * kk * sm, dmg: d.dmg, pts: d.pts,
      ph: rnd(0, 6.28), amp: type === 'drone' ? rnd(20, 70) * kk : 0, shoot: d.shoots ? rnd(900, d.shoots) : 0, shootEvery: d.shoots || 0, flash: 0,
    };
  }

  function spawn(type) {
    const kk = k(), W = env.W, H = env.H;
    if (type === 'boss') {
      // Two boss types alternate: WAR ROBOT (waves 5, 15…) aims volleys; KRAKEN (waves 10, 20…) fires fans and summons swarms.
      const kraken = Math.floor(s.wave / 5) % 2 === 0, name = kraken ? 'KRAKEN' : 'WAR ROBOT';
      const hp = Math.round((70 + s.wave * 14) * s.diff.boss * (kraken ? 1.15 : 1));
      s.enemies.push({ type: 'boss', boss: true, kind: kraken ? 'kraken' : 'robot', name, e: kraken ? '🐙' : '🤖', hp, max: hp, x: W / 2, y: -80 * kk, r: (kraken ? 80 : 72) * kk, pts: kraken ? 2000 : 1500, dmg: 40, dir: 1, shoot: 1500, summon: 4000, ph: 0, flash: 0 });
      banner(`⚠️ ${name} INCOMING`, 1800); sfx.bad();
      return;
    }
    const edge = Math.random();
    let x, y;
    if (edge < 0.7) { x = rnd(0.05 * W, 0.95 * W); y = -40 * kk; }
    else if (edge < 0.85) { x = -40 * kk; y = rnd(0, 0.35 * H); }
    else { x = W + 40 * kk; y = rnd(0, 0.35 * H); }
    s.enemies.push(mkEnemy(type, x, y));
  }

  function enemyShot(x, y, tx, ty, speed, dmg = 8) {
    const dx = tx - x, dy = ty - y, l = Math.hypot(dx, dy) || 1, v = speed * k();
    s.shots.push({ proj: true, x, y, vx: (dx / l) * v, vy: (dy / l) * v, r: 11 * k(), dmg });
  }

  function end() {
    if (!on) return;
    on = false;
    sfx.lose();
    api.over(s.score);
    api.say(`A full-screen drone-defence shooter just ended. The player scored ${s.score} and reached wave ${s.wave}.`, CANNED);
  }

  // ---------- main update ----------
  function step(dtRaw) {
    if (!on || !s) return;
    const dt = Math.min(dtRaw, 50), kk = k(), W = env.W, H = env.H, b = base();

    // Freeze the world if tracking is lost, so a dropped hand is never unfair. Give up after a long absence.
    if (s.hand) { s.noHand = 0; s.pausedTotal = 0; } else s.noHand += dt;
    s.paused = s.noHand > PAUSE_AFTER;
    if (s.paused) { s.pausedTotal += dt; if (s.pausedTotal > ABANDON_AFTER) end(); return; }

    s.t += dt;
    const f = 1 - Math.exp(-dt / 40);
    s.ax = clamp(s.ax + (s.tx - s.ax) * f, 0, W); s.ay = clamp(s.ay + (s.ty - s.ay) * f, 0, H);
    s.flash = Math.max(0, s.flash - dt / 450);
    s.cool -= dt; s.flakCd -= dt; s.shockCd -= dt; s.repairCd -= dt; s.power = Math.max(0, s.power - dt);
    if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 0; }

    // weapons
    const w = weaponFor(s.g);
    if (s.hand && w === 'rail') { s.charge = Math.min(1, s.charge + dt / CHARGE_MS); s.fx = s.ax; s.fy = s.ay; }
    else if (s.charge > 0) { if (s.hand && s.charge > 0.2) fireRail(s.fx, s.fy, s.charge); s.charge = 0; }
    if (s.hand && w === 'blaster' && s.cool <= 0) { s.cool = 150; fireBlaster(); }
    if (s.hand && w === 'flak' && s.flakCd <= 0) { s.flakCd = FLAK_CD; fireFlak(); }
    if (s.hand && w === 'shock' && s.pg !== 'Open_Palm') { if (s.shockCd <= 0) shock(); else pop(b.x, b.y - 90 * kk, 'recharging…', '#9aa'); }
    if (s.hand && w === 'repair' && s.pg !== 'ILoveYou') { if (s.repairCd <= 0 && s.hp < 100) repair(); else pop(b.x, b.y - 90 * kk, s.hp >= 100 ? 'HP full' : 'recharging…', '#9aa'); }
    s.pg = s.hand ? s.g : 'None';
    if (!on) return;

    // is the crosshair over something? (drives crosshair colour)
    s.onTarget = targets().some((t) => Math.hypot(t.x - s.ax, t.y - s.ay) - (t.r || 0) < 18 * kk);

    // waves
    if (s.phase === 'break') { s.breakT -= dt; if (s.breakT <= 0) startWave(); }
    else {
      s.spawnT -= dt;
      if (s.queue.length && s.spawnT <= 0) { spawn(s.queue.shift()); s.spawnT = Math.max(320, 1000 - s.wave * 55) * s.diff.spawn * rnd(0.7, 1.2); }
      if (!s.queue.length && !s.enemies.some((e) => !e.dead)) {
        s.score += s.wave * 100; s.hp = Math.min(100, s.hp + 10);
        banner(`WAVE ${s.wave} CLEAR  +${s.wave * 100}`, 2200); sfx.good();
        s.phase = 'break'; s.breakT = 2800;
      }
    }

    // enemies
    const sm = (1 + 0.06 * (s.wave - 1)) * s.diff.speed;
    for (const e of s.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, (e.flash || 0) - dt);
      if (e.boss) {
        if (e.y < 110 * kk) e.y += 0.1 * kk * dt;
        else if (e.kind === 'kraken') {
          e.x = W / 2 + Math.sin(s.t * 0.0006) * W * 0.32; e.y = 120 * kk + Math.sin(s.t * 0.0011) * 18 * kk;
          e.shoot -= dt;
          if (e.shoot <= 0) { // fan of 9 shots across the lower half
            e.shoot = Math.max(1300, 2600 - s.wave * 40);
            const off = rnd(-0.14, 0.14);
            for (let i = 0; i < 9; i++) { const a = 0.35 + off + (i * 2.4) / 8, v = 0.15 * kk; s.shots.push({ proj: true, x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 11 * kk, dmg: 8 }); }
          }
          e.summon -= dt;
          if (e.summon <= 0) { e.summon = 6500; for (let i = -1; i <= 1; i++) s.enemies.push(mkEnemy('swarm', e.x + i * 50 * kk, e.y + e.r * 0.5)); }
        } else {
          e.x += e.dir * 0.13 * kk * sm * dt;
          if (e.x > W * 0.85) e.dir = -1; else if (e.x < W * 0.15) e.dir = 1;
          e.shoot -= dt;
          if (e.shoot <= 0) {
            e.shoot = Math.max(900, 1900 - s.wave * 40);
            for (let i = -2; i <= 2; i++) enemyShot(e.x + i * 22 * kk, e.y + e.r * 0.6, b.x + i * 120 * kk, b.y, 0.2, 10);
          }
        }
        continue;
      }
      const dx = b.x - e.x, dy = b.y - e.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist, v = (e.speed / 1000) * dt;
      if (e.type === 'gunship' && dist < H * 0.5) { e.x += Math.cos(s.t * 0.0015 + e.ph) * 0.05 * kk * dt; }
      else {
        const wob = e.amp ? Math.cos(s.t * 0.003 + e.ph) * e.amp * 0.0015 * dt : 0;
        e.x += ux * v - uy * wob; e.y += uy * v + ux * wob;
      }
      if (e.shootEvery) {
        e.shoot -= dt;
        if (e.shoot <= 0 && e.y > 0) { e.shoot = e.shootEvery; enemyShot(e.x, e.y + e.r * 0.5, b.x, b.y, 0.17); }
      }
      if (dist < 36 * kk + e.r * 0.4) { e.dead = true; burst(e.x, e.y, '#ff5c7a', 14); hurtBase(e.dmg); if (!on) return; }
    }

    // enemy projectiles
    for (const p of s.shots) {
      if (p.dead) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < -50 || p.x > W + 50 || p.y < -80 || p.y > H + 50) { p.dead = true; continue; }
      if (Math.hypot(p.x - b.x, p.y - b.y) < 34 * kk) { p.dead = true; burst(p.x, p.y, '#ff5c7a', 8); hurtBase(p.dmg); if (!on) return; }
    }

    // pick-ups drift down slowly and expire
    for (const it of s.items) { it.life -= dt; it.y += 0.012 * kk * dt; if (it.life <= 0) it.dead = true; }

    // effects
    for (const t of s.tracers) t.life -= dt;
    for (const r of s.rings) { r.life -= dt; r.r = r.max * (1 - Math.pow(Math.max(0, r.life) / r.maxLife, 2)); }
    for (const q of s.beams) q.life -= dt;
    for (const p of s.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (const p of s.pops) { p.y -= 0.05 * kk * dt; p.life -= dt; }
    if (s.banner) { s.banner.life -= dt; if (s.banner.life <= 0) s.banner = null; }

    s.enemies = s.enemies.filter((o) => !o.dead);
    s.shots = s.shots.filter((o) => !o.dead);
    s.items = s.items.filter((o) => !o.dead);
    s.tracers = s.tracers.filter((o) => o.life > 0);
    s.rings = s.rings.filter((o) => o.life > 0);
    s.beams = s.beams.filter((o) => o.life > 0);
    s.parts = s.parts.filter((o) => o.life > 0);
    s.pops = s.pops.filter((o) => o.life > 0);
  }

  // ---------- drawing ----------
  const glow = (g, color, blur) => { g.shadowColor = color; g.shadowBlur = blur; };

  function drawHud(g) {
    const kk = k(), W = env.W, H = env.H, pad = 22 * kk;
    g.save(); g.textBaseline = 'top';
    g.textAlign = 'left'; g.fillStyle = '#fff'; glow(g, '#19f3ff', 12 * kk);
    g.font = `800 ${38 * kk}px sans-serif`; g.fillText(String(s.score).padStart(6, '0'), pad, pad);
    g.shadowBlur = 0; g.font = `600 ${16 * kk}px sans-serif`; g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillText('SCORE', pad, pad + 42 * kk);
    if (s.combo > 1) {
      g.fillStyle = mult() > 1 ? '#ffd23b' : '#fff'; g.font = `800 ${24 * kk}px sans-serif`;
      g.fillText(`COMBO ${s.combo}  ×${mult()}`, pad, pad + 66 * kk);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(pad, pad + 98 * kk, 160 * kk, 5 * kk);
      g.fillStyle = '#ffd23b'; g.fillRect(pad, pad + 98 * kk, 160 * kk * clamp(s.comboT / 2200, 0, 1), 5 * kk);
    }
    // wave + base health, top centre
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = `800 ${24 * kk}px sans-serif`;
    g.fillText(`WAVE ${Math.max(1, s.wave)}`, W / 2, pad);
    const bw = 320 * kk, bh = 14 * kk, bx = W / 2 - bw / 2, by = pad + 34 * kk, hpf = s.hp / 100;
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = hpf > 0.5 ? '#b6ff3b' : hpf > 0.25 ? '#ffd23b' : '#ff5c7a'; glow(g, g.fillStyle, 10 * kk); g.fillRect(bx, by, bw * hpf, bh);
    g.shadowBlur = 0; g.font = `600 ${13 * kk}px sans-serif`; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText(`BASE ${Math.ceil(s.hp)}%`, W / 2, by + bh + 4 * kk);
    if (s.power > 0) { g.fillStyle = '#ffd23b'; g.font = `800 ${18 * kk}px sans-serif`; g.fillText(`⭐ 2× DAMAGE ${(s.power / 1000).toFixed(1)}s`, W / 2, by + bh + 26 * kk); }

    // weapon strip, bottom-left
    const tile = 66 * kk, gap = 10 * kk, active = s.hand ? weaponFor(s.g) : '';
    WEAPONS.forEach((wp, i) => {
      const x = pad + i * (tile + gap), y = H - tile - pad, on_ = wp.id === active;
      g.fillStyle = on_ ? 'rgba(20,10,50,0.92)' : 'rgba(7,6,15,0.7)'; g.strokeStyle = on_ ? wp.color : 'rgba(255,255,255,0.25)'; g.lineWidth = (on_ ? 4 : 2) * kk;
      if (on_) glow(g, wp.color, 16 * kk); else g.shadowBlur = 0;
      g.beginPath(); g.roundRect(x, y, tile, tile, 12 * kk); g.fill(); g.stroke(); g.shadowBlur = 0;
      g.fillStyle = '#fff'; drawEmoji(g, wp.e, x + tile / 2, y + tile * 0.4, tile * 0.42);
      g.font = `700 ${11 * kk}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(wp.name, x + tile / 2, y + tile - 7 * kk);
      const cd = wp.id === 'shock' ? s.shockCd / SHOCK_CD : wp.id === 'repair' ? s.repairCd / REPAIR_CD : wp.id === 'flak' ? s.flakCd / FLAK_CD : 0;
      if (cd > 0) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y + tile * (1 - clamp(cd, 0, 1)), tile, tile * clamp(cd, 0, 1)); }
      if (wp.id === 'rail' && s.charge > 0) { g.fillStyle = wp.color; g.fillRect(x, y + tile - 6 * kk, tile * s.charge, 6 * kk); }
    });
    g.restore();
  }

  function drawCrosshair(g) {
    const kk = k(), w = WEAPONS.find((x) => x.id === weaponFor(s.g)), col = s.onTarget ? '#ff5c7a' : w.color, r = 22 * kk * (s.onTarget ? 1.12 : 1);
    g.save(); g.strokeStyle = col; g.fillStyle = col; glow(g, col, 14 * kk); g.lineWidth = 3 * kk; g.lineCap = 'round';
    g.beginPath(); g.arc(s.ax, s.ay, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(s.ax, s.ay, 3 * kk, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2, c = Math.cos(a), sn = Math.sin(a);
      g.beginPath(); g.moveTo(s.ax + c * (r + 4 * kk), s.ay + sn * (r + 4 * kk)); g.lineTo(s.ax + c * (r + 14 * kk), s.ay + sn * (r + 14 * kk)); g.stroke();
    }
    if (s.charge > 0) {
      g.strokeStyle = '#fff'; g.lineWidth = 5 * kk; g.beginPath(); g.arc(s.ax, s.ay, r + 22 * kk, -Math.PI / 2, -Math.PI / 2 + s.charge * Math.PI * 2); g.stroke();
      const b = base(); g.setLineDash([8 * kk, 10 * kk]); g.strokeStyle = 'rgba(255,47,208,0.6)'; g.lineWidth = 2 * kk;
      g.beginPath(); g.moveTo(b.x, b.y - 20 * kk); g.lineTo(s.ax, s.ay); g.stroke(); g.setLineDash([]);
    }
    g.shadowBlur = 0; g.font = `700 ${13 * kk}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = col;
    g.fillText(w.name, s.ax, s.ay + r + 18 * kk);
    g.restore();
  }

  function draw(g) {
    if (!s) return;
    const kk = k(), W = env.W, H = env.H, b = base();

    // base: glass dome + turret pointing at the crosshair
    const hpf = s.hp / 100, bc = hpf > 0.5 ? '#19f3ff' : hpf > 0.25 ? '#ffd23b' : '#ff5c7a';
    g.save(); glow(g, bc, 22 * kk); g.fillStyle = 'rgba(20,10,50,0.7)'; g.strokeStyle = bc; g.lineWidth = 4 * kk;
    g.beginPath(); g.arc(b.x, b.y + 16 * kk, 52 * kk, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
    const ang = Math.atan2(s.ay - (b.y - 20 * kk), s.ax - b.x);
    g.lineWidth = 9 * kk; g.lineCap = 'round'; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(b.x, b.y - 20 * kk); g.lineTo(b.x + Math.cos(ang) * 36 * kk, b.y - 20 * kk + Math.sin(ang) * 36 * kk); g.stroke();
    g.restore();

    // beams, rings, tracers
    for (const q of s.beams) {
      const a = q.life / q.maxLife;
      g.save(); g.globalAlpha = a; g.lineCap = 'round'; glow(g, '#ff2fd0', 30 * kk);
      g.strokeStyle = '#ff2fd0'; g.lineWidth = q.w; g.beginPath(); g.moveTo(q.x1, q.y1); g.lineTo(q.x2, q.y2); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = q.w * 0.35; g.beginPath(); g.moveTo(q.x1, q.y1); g.lineTo(q.x2, q.y2); g.stroke(); g.restore();
    }
    for (const r of s.rings) {
      g.save(); g.globalAlpha = clamp(r.life / r.maxLife, 0, 1); g.strokeStyle = r.color; glow(g, r.color, 20 * kk); g.lineWidth = (r.thick || 6) * kk;
      g.beginPath(); g.arc(r.x, r.y, Math.max(1, r.r), 0, Math.PI * 2); g.stroke(); g.restore();
    }
    g.save(); g.lineCap = 'round'; glow(g, '#19f3ff', 10 * kk);
    for (const t of s.tracers) { g.globalAlpha = clamp(t.life / 90, 0, 1); g.strokeStyle = '#bff'; g.lineWidth = 3 * kk; g.beginPath(); g.moveTo(t.x1, t.y1); g.lineTo(t.x2, t.y2); g.stroke(); }
    g.restore();

    // enemies, pick-ups, projectiles
    for (const e of s.enemies) {
      drawEmoji(g, e.e, e.x, e.y, e.r * 2);
      if (e.flash > 0) { g.save(); g.globalAlpha = 0.45; g.fillStyle = '#fff'; g.beginPath(); g.arc(e.x, e.y, e.r * 0.9, 0, Math.PI * 2); g.fill(); g.restore(); }
      if (e.max > 1 && !e.boss) {
        const w = e.r * 1.6, x = e.x - w / 2, y = e.y - e.r - 10 * kk;
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y, w, 5 * kk); g.fillStyle = '#b6ff3b'; g.fillRect(x, y, w * Math.max(0, e.hp / e.max), 5 * kk);
      }
    }
    const boss = s.enemies.find((e) => e.boss);
    if (boss) {
      const w = W * 0.5, x = W / 2 - w / 2, y = H - 150 * kk;
      g.save(); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y, w, 12 * kk); g.fillStyle = '#ffd23b'; glow(g, '#ffd23b', 12 * kk); g.fillRect(x, y, w * Math.max(0, boss.hp / boss.max), 12 * kk);
      g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = `800 ${14 * kk}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(boss.name || 'BOSS', W / 2, y - 4 * kk); g.restore();
    }
    for (const it of s.items) {
      if (it.life < 2000 && Math.floor(it.life / 120) % 2 === 0) continue;
      g.save(); g.strokeStyle = it.type === 'power' ? '#ffd23b' : '#b6ff3b'; glow(g, g.strokeStyle, 14 * kk); g.lineWidth = 3 * kk;
      g.beginPath(); g.arc(it.x, it.y, it.r + 4 * kk * Math.sin(s.t / 120), 0, Math.PI * 2); g.stroke(); g.restore();
      drawEmoji(g, it.e, it.x, it.y, it.r * 1.5);
    }
    g.save(); g.fillStyle = '#ff2fd0'; glow(g, '#ff2fd0', 14 * kk);
    for (const p of s.shots) { g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
    g.restore();

    // particles + pop text
    for (const p of s.parts) { g.globalAlpha = clamp(p.life / 450, 0, 1); g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, 3 * kk, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    for (const p of s.pops) { g.globalAlpha = clamp(p.life / 800, 0, 1); g.fillStyle = p.color; g.font = `800 ${24 * kk}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.text, p.x, p.y); }
    g.globalAlpha = 1;

    if (s.hand || s.paused) { if (s.hand) drawCrosshair(g); }
    drawHud(g);

    if (s.banner) {
      const a = clamp(Math.min(s.banner.life, s.banner.max - s.banner.life) / 300, 0, 1);
      g.save(); g.globalAlpha = a; g.fillStyle = '#fff'; glow(g, '#ff2fd0', 30 * kk); g.font = `900 ${64 * kk}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s.banner.text, W / 2, H * 0.36); g.restore();
    }
    if (s.flash > 0) { g.fillStyle = `rgba(255,40,80,${s.flash * 0.28})`; g.fillRect(0, 0, W, H); }
    if (s.paused) {
      g.fillStyle = 'rgba(7,6,15,0.6)'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff'; g.font = `800 ${40 * kk}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('✋ Show your hand to continue', W / 2, H / 2);
    }
  }

  return {
    title: 'Gesture Strike',
    weapons: WEAPONS,
    isOn: () => on,
    waveReached: () => (s ? Math.max(1, s.wave) : 0),
    start(level) { reset(level); on = true; },
    stop() { on = false; s = null; },
    step, draw,
    /** `aim` = where the crosshair should go (fingertip, or palm while making a fist). */
    onHand({ hand, gesture, tip, palm }) {
      if (!s) return;
      s.hand = !!hand; s.g = hand ? gesture : 'None';
      const aim = gesture === 'Closed_Fist' ? palm : tip;
      if (hand && aim) { s.tx = aim[0]; s.ty = aim[1]; }
    },
  };
}
