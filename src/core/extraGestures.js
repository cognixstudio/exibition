// extraGestures.js — extra hand signs detected from the 21 MediaPipe landmarks.
// MediaPipe's built-in recognizer only knows 7 gestures; these rules add more.
//
//   detectExtra(hand, aspect) → 'OK_Sign' | 'Finger_Heart' | 'Rock_On' | 'Call_Me'
//                               | 'Thumb_Down' | 'Three' | 'Vulcan' | null
//   createSmoother()          → fn(name|null) that removes single-frame flicker
//
// Landmarks: 0 wrist · 1-4 thumb · 5-8 index · 9-12 middle · 13-16 ring · 17-20 pinky
// (tips are 4, 8, 12, 16, 20). All distances are measured in "palm lengths".

const FINGERS = { i: [5, 6, 7, 8], m: [9, 10, 11, 12], r: [13, 14, 15, 16], p: [17, 18, 19, 20] };

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const dist = (a, b) => len(sub(a, b));
const angleAt = (a, b, c) => {
  const u = sub(a, b), v = sub(c, b);
  const m = len(u) * len(v) || 1e-9;
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / m))) * 180 / Math.PI;
};

/** true when the finger is straight, false when bent or curled. */
function isExtended(p, [mcp, pip, dip, tip]) {
  return angleAt(p[mcp], p[pip], p[dip]) >= 150 && angleAt(p[pip], p[dip], p[tip]) >= 145;
}

/** Name of the extra sign the hand is making, or null. `aspect` = video width / height. */
export function detectExtra(hand, aspect = 4 / 3) {
  if (!hand?.landmarks || hand.landmarks.length < 21) return null;
  const p = hand.landmarks.map((l) => ({ x: l.x * aspect, y: l.y, z: l.z * aspect }));
  const S = dist(p[0], p[9]) || 1e-6;                       // palm length = unit of measure
  const n = (a, b) => dist(p[a], p[b]) / S;

  const e = {};
  for (const k in FINGERS) e[k] = isExtended(p, FINGERS[k]);
  const curledCount = [e.i, e.m, e.r, e.p].filter((v) => !v).length;
  const thumbOut = n(4, 5) > 0.75;                          // thumb sticking out sideways
  const thumbTucked = n(4, 5) < 0.6;
  const pinch = n(4, 8) < 0.38;                             // thumb tip touching index tip

  // 👎 Thumbs down: fist whose thumb points down (lowest point of the hand).
  const lowest = p.every((pt, i) => i === 4 || pt.y <= p[4].y + 0.02 * S);
  if (hand.rawGesture === 'Thumb_Down' || (curledCount === 4 && n(4, 2) > 0.5 && p[4].y > p[3].y && p[3].y > p[2].y && lowest)) {
    return 'Thumb_Down';
  }

  // 👌 OK sign: thumb + index make a ring, other three fingers stay straight.
  if (pinch && e.m && e.r && e.p) return 'OK_Sign';

  // 🫰 Finger heart: thumb + index tips touch, other three fingers folded away.
  // The index must stay partly raised, otherwise a plain fist (thumb over the index) would match.
  if (pinch && !e.m && !e.r && !e.p && n(5, 8) > 0.55) return 'Finger_Heart';

  // 🤙 Call me: thumb and pinky out, the other three curled.
  if (thumbOut && e.p && !e.i && !e.m && !e.r) return 'Call_Me';

  // 🤘 Rock on: index + pinky up, middle + ring folded, thumb tucked
  // (with the thumb out it is the "I love you" sign, which MediaPipe already knows).
  if (e.i && e.p && !e.m && !e.r && !thumbOut) return 'Rock_On';

  // 🖖 Vulcan salute: four fingers up, split between middle and ring finger.
  if (e.i && e.m && e.r && e.p) {
    const gapMR = n(12, 16), gapIM = n(8, 12), gapRP = n(16, 20);
    if (gapMR > 0.4 && gapMR > 1.7 * Math.max(gapIM, gapRP)) return 'Vulcan';
  }

  // 3️⃣ Three: index, middle and ring up; pinky folded; thumb not sticking out.
  if (e.i && e.m && e.r && !e.p && !thumbOut) return 'Three';

  return null;
}

/**
 * Smooths per-frame results: a sign only "counts" when it won at least `need`
 * of the last `size` frames, so one bad frame does not break a held pose.
 */
export function createSmoother(size = 6, need = 4) {
  const buf = [];
  return (name) => {
    buf.push(name || null);
    if (buf.length > size) buf.shift();
    const counts = {};
    for (const v of buf) if (v) counts[v] = (counts[v] || 0) + 1;
    let best = null, bestN = 0;
    for (const k in counts) if (counts[k] > bestN) { best = k; bestN = counts[k]; }
    return bestN >= need ? best : null;
  };
}
