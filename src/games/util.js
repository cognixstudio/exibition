// util.js — small helpers shared by the arcade games.
export const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif';
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Draw an emoji centred on (x, y) with the given pixel size. */
export function drawEmoji(g, emoji, x, y, size) {
  g.font = `${size}px ${EMOJI_FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, x, y);
}
