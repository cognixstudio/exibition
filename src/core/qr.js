// qr.js — tiny dependency-free QR code generator (byte mode, error-correction level M, versions 1-10).
// Enough for a URL up to ~210 characters. Works fully offline.

// [EC codewords per block, [blocks, data codewords per block], optional second group]
const VERSIONS = [
  null,
  [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
  [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// ---- Reed-Solomon over GF(256)
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsRemainder(data, degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const n = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { n[j] ^= g[j]; n[j + 1] ^= mul(g[j], EXP[i]); }
    g = n;
  }
  const r = new Array(degree).fill(0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    for (let i = 0; i < degree; i++) r[i] ^= mul(g[i + 1], f);
  }
  return r;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Build the data + error-correction codewords for a given version. */
function buildCodewords(bytes, version) {
  const [ec, ...groups] = VERSIONS[version];
  const dataCap = groups.reduce((s, [n, d]) => s + n * d, 0);
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4);
  put(bytes.length, version >= 10 ? 16 : 8);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; cw.length < dataCap; pad ^= 0xec ^ 0x11) cw.push(pad);

  const blocks = [];
  let pos = 0;
  groups.forEach(([n, d]) => { for (let i = 0; i < n; i++) { blocks.push(cw.slice(pos, pos + d)); pos += d; } });
  const ecs = blocks.map((b) => rsRemainder(b, ec));
  const out = [];
  const maxLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) blocks.forEach((b) => { if (i < b.length) out.push(b[i]); });
  for (let i = 0; i < ec; i++) ecs.forEach((e) => out.push(e[i]));
  return out;
}

function penalty(m) {
  const n = m.length;
  let p = 0;
  const lineScore = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1, s = '';
      for (let b = 0; b < n; b++) {
        const v = get(a, b);
        s += v ? '1' : '0';
        if (b > 0 && v === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1;
      }
      p += 40 * ((s.match(/10111010000/g) || []).length + (s.match(/00001011101/g) || []).length);
    }
  };
  lineScore((r, c) => m[r][c]);
  lineScore((c, r) => m[r][c]);
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
  }
  const dark = m.flat().filter(Boolean).length;
  p += 10 * Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5);
  return p;
}

/**
 * Returns the QR code as a 2D array of booleans (true = dark module).
 * `forceMask` (0-7) is only for testing.
 */
export function qrMatrix(text, forceMask = -1) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let version = 1;
  const capacity = (v) => VERSIONS[v].slice(1).reduce((s, [n, d]) => s + n * d, 0) - (v >= 10 ? 3 : 2);
  while (version <= 10 && bytes.length > capacity(version)) version++;
  if (version > 10) throw new Error('That text is too long for the QR code (max about 210 characters).');

  const size = 17 + 4 * version;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false)); // function (non-data) modules
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

  // finder patterns: light separator, then dark outer ring, light ring, dark 3x3 core
  for (const [cx, cy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      set(x, y, inside && Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) !== 2);
    }
  }
  // timing patterns
  for (let i = 8; i < size - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
  // alignment patterns
  const ap = ALIGN[version];
  for (const cy of ap) for (const cx of ap) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === ap[ap.length - 1]) || (cy === 6 && cx === ap[ap.length - 1])) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // reserve format + version areas (drawn properly below)
  for (let i = 0; i < 9; i++) { fn[8][i] = true; fn[i][8] = true; }
  for (let i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true; }
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { fn[i][size - 11 + j] = true; fn[size - 11 + j][i] = true; }

  // place data bits (zig-zag from the bottom-right)
  const cw = buildCodewords(bytes, version);
  const bits = [];
  cw.forEach((b) => { for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1); });
  let k = 0, up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const y = up ? size - 1 - i : i;
      for (const x of [col, col - 1]) if (!fn[y][x]) mod[y][x] = k < bits.length ? bits[k++] === 1 : false;
    }
    up = !up;
  }

  const drawFormat = (m, mask) => {
    const data = (0 << 3) | mask; // level M = 0
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
    for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
    m[size - 8][8] = true; // always-dark module
  };
  const drawVersion = (m) => {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((v >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      m[b][a] = bit; m[a][b] = bit;
    }
  };

  // choose the best mask (lowest penalty)
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask >= 0 && mask !== forceMask) continue;
    const m = mod.map((row) => row.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
    drawFormat(m, mask); drawVersion(m);
    const sc = forceMask >= 0 ? 0 : penalty(m);
    if (sc < bestScore) { bestScore = sc; best = m; }
  }
  return best;
}

/** QR code as an SVG string (crisp squares, with a quiet-zone margin). */
export function qrSvg(text, { size = 160, margin = 4, fg = '#0a0a1a', bg = '#ffffff' } = {}) {
  const m = qrMatrix(text);
  const n = m.length, total = n + margin * 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${total}" height="${total}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}
