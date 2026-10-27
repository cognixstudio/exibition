// aslRules.js — landmark rules for static ASL letters + a few motion-based signs.
// classify() returns { label, conf, kind, shape, scale }:
//   label  'A'..'Y' | 'I LOVE YOU' | 'SPACE' | 'BACKSPACE' | null
//   conf   0..1  (below ~0.65 the caller may ask the AI vision model instead)
//   shape  'open' | 'flat' | 'fist' | 'point' | 'other'  (used by motion signs)

const FINGERS = { i: [5, 6, 7, 8], m: [9, 10, 11, 12], r: [13, 14, 15, 16], p: [17, 18, 19, 20] };

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const dist = (a, b) => len(sub(a, b));
const angleBetween = (u, v) => {
  const m = len(u) * len(v) || 1e-9;
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / m))) * 180 / Math.PI;
};
/** Angle in degrees at point b of the path a-b-c. */
const angleAt = (a, b, c) => angleBetween(sub(a, b), sub(c, b));

/** 'ext' (straight), 'hook' (bent) or 'curl' (folded into the palm). */
function fingerState(p, [mcp, pip, dip, tip]) {
  const a1 = angleAt(p[mcp], p[pip], p[dip]);
  const a2 = angleAt(p[pip], p[dip], p[tip]);
  if (a1 >= 150 && a2 >= 145) return 'ext';
  if (a1 < 110) return 'curl';
  return 'hook';
}

export function classify(hand, aspect = 1) {
  // Aspect-correct so distances are not squashed on non-square video.
  const p = hand.landmarks.map((l) => ({ x: l.x * aspect, y: l.y, z: l.z * aspect }));
  const S = dist(p[0], p[9]) || 1e-6;                 // palm length = our unit of measure
  const n = (a, b) => dist(p[a], p[b]) / S;
  const st = {};
  for (const k in FINGERS) st[k] = fingerState(p, FINGERS[k]);
  const ext = Object.values(st).filter((s) => s === 'ext').length;
  const tOut = n(4, 5);                                // how far the thumb sticks out
  const upV = sub(p[9], p[0]);
  const orient = Math.abs(upV.x) > Math.abs(upV.y) * 1.1 ? 'side' : upV.y > 0 ? 'down' : 'up';
  const dirAng = (a, b, c, d) => angleBetween(sub(p[b], p[a]), sub(p[d], p[c]));
  const spreadIM = dirAng(5, 8, 9, 12);                // index vs middle finger angle

  let shape = 'other';
  if (ext === 4) shape = tOut > 0.7 ? 'open' : 'flat';
  else if (ext === 0 && Object.values(st).every((s) => s === 'curl')) shape = 'fist';
  else if (ext === 1 && st.i === 'ext') shape = 'point';
  const out = (label, conf, kind = 'letter') => ({ label, conf, kind, shape, scale: S });
  const none = out(null, 0.3, 'none');

  // --- controls & signs that ignore orientation
  if (hand.rawGesture === 'Thumb_Down') return out('BACKSPACE', 0.95, 'control');
  if (st.i === 'ext' && st.p === 'ext' && st.m !== 'ext' && st.r !== 'ext' && tOut > 0.8) {
    return out('I LOVE YOU', hand.gesture === 'ILoveYou' ? 0.95 : 0.85, 'sign');
  }

  // --- hand pointing sideways: G, H
  if (orient === 'side') {
    if (st.i === 'ext' && st.m !== 'ext' && st.r !== 'ext' && st.p !== 'ext') return out('G', tOut > 0.5 ? 0.7 : 0.5);
    if (st.i === 'ext' && st.m === 'ext' && st.r !== 'ext' && st.p !== 'ext') return out('H', spreadIM < 14 ? 0.7 : 0.5);
    return none;
  }
  // --- hand pointing down: P, Q
  if (orient === 'down') {
    if (st.i === 'ext' && st.m === 'ext' && st.r !== 'ext' && st.p !== 'ext') return out('P', 0.55);
    if (st.i === 'ext' && st.m !== 'ext' && st.r !== 'ext' && st.p !== 'ext') return out('Q', 0.55);
    return none;
  }

  // --- upright hand
  if (ext === 4) {
    if (tOut > 0.7) return out('SPACE', 0.9, 'control');           // open palm held = space
    return out('B', dirAng(5, 8, 17, 20) < 22 ? 0.85 : 0.6);       // fingers together, thumb across
  }
  if (ext === 3) {
    if (st.p !== 'ext') return out('W', 0.75);
    if (st.i !== 'ext' && n(4, 8) < 0.5) return out('F', 0.85);    // thumb-index circle
    return none;
  }
  if (ext === 2) {
    if (st.i === 'ext' && st.m === 'ext') {
      const gap = n(8, 12);
      if (n(4, 10) < 0.55 && spreadIM >= 10) return out('K', 0.7);
      if (spreadIM >= 14) return out('V', 0.85);
      if (gap < 0.15) return out('R', 0.6);                         // crossed fingers
      return out('U', 0.8);
    }
    return none;
  }
  if (ext === 1) {
    if (st.i === 'ext') {
      if (tOut > 0.8) return out('L', 0.85);
      if (n(4, 12) < 0.55 && st.m !== 'ext') return out('D', 0.8);
      return out(null, 0.4, 'none');                                // plain pointing (used by the "No" wag)
    }
    if (st.p === 'ext') return out(tOut > 0.8 ? 'Y' : 'I', 0.85);
    return none;
  }
  // ext === 0: curved hand shapes and fist family
  const hooks = Object.values(st).filter((s) => s === 'hook').length;
  if (hooks >= 3) {
    if (n(4, 8) < 0.45 && n(4, 12) < 0.65) return out('O', 0.8);
    if (n(4, 16) < 0.55) return out('E', 0.55);
    if (n(4, 8) < 1.4) return out('C', 0.7);
  }
  if (st.i === 'hook' && st.m === 'curl' && st.r === 'curl' && st.p === 'curl') return out('X', 0.65);
  if (p[4].y < p[6].y - 0.08 * S && n(4, 5) > 0.35) return out('A', 0.7);   // thumb up beside the fist
  if (n(4, 10) < 0.5) return out('S', 0.65);                                // thumb across the front
  if (n(4, 6) < 0.4) return out('T', 0.5);
  return none; // M, N and unclear fists -> AI fallback
}

/** Detects waving / nodding / wagging / downward "thank you" from wrist history. */
export class MotionTracker {
  constructor() { this.s = []; }
  clear() { this.s = []; }
  push(t, x, y, S) {
    this.s.push({ t, x, y, S });
    while (this.s.length && t - this.s[0].t > 1000) this.s.shift();
  }
  /** Count direction reversals larger than thr along an axis. */
  rev(axis, thr, arr = this.s) {
    if (arr.length < 6) return 0;
    let dir = 0, ext = arr[0][axis], count = 0;
    for (let i = 1; i < arr.length; i++) {
      const v = arr[i][axis];
      if (dir === 0) { if (v > ext + thr) { dir = 1; ext = v; } else if (v < ext - thr) { dir = -1; ext = v; } }
      else if (dir === 1) { if (v > ext) ext = v; else if (v < ext - thr) { count++; dir = -1; ext = v; } }
      else if (v < ext) ext = v; else if (v > ext + thr) { count++; dir = 1; ext = v; }
    }
    return count;
  }
  /** Returns 'HELLO' | 'YES' | 'NO' | 'THANK YOU' | null for the current hand shape. */
  detect(shape) {
    const s = this.s;
    if (s.length < 8) return null;
    const last = s[s.length - 1], thr = 0.45 * last.S;
    if ((shape === 'open' || shape === 'flat') && this.rev('x', thr) >= 2) return 'HELLO';
    if (shape === 'fist' && this.rev('y', thr) >= 2) return 'YES';
    if (shape === 'point' && this.rev('x', thr) >= 2) return 'NO';
    if (shape === 'flat' || shape === 'open') {
      const recent = s.filter((q) => last.t - q.t <= 700);
      if (recent.length >= 5 && recent[0].y < 0.5 && last.y - recent[0].y > 1.3 * last.S && this.rev('y', thr, recent) === 0) return 'THANK YOU';
    }
    return null;
  }
}
