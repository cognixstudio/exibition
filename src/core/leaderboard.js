// leaderboard.js — local top-10 scores per game, stored in this browser (great for exhibition stands).
import { esc } from './ui.js';

const KEY = 'gesture-lab:board:';
const MAX = 10;

/** Saved scores, best first. Never throws. */
export function getBoard(game) {
  try {
    const a = JSON.parse(localStorage.getItem(KEY + game) || '[]');
    return Array.isArray(a) ? a.filter((e) => e && typeof e.score === 'number').slice(0, MAX) : [];
  } catch { return []; }
}

/** Would this score make it onto the board? */
export function qualifies(game, score) {
  if (!(score > 0)) return false;
  const b = getBoard(game);
  return b.length < MAX || score > b[b.length - 1].score;
}

/** Add a score. Returns the saved entry (its `date` identifies it for highlighting). */
export function addScore(game, name, score) {
  const entry = { name: String(name || '').trim().slice(0, 12) || 'Player', score, date: Date.now() };
  const board = [...getBoard(game), entry].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, MAX);
  try { localStorage.setItem(KEY + game, JSON.stringify(board)); } catch { /* storage blocked */ }
  return entry;
}

export function clearBoard(game) {
  try { localStorage.removeItem(KEY + game); } catch { /* ignore */ }
}

/** <li> rows for an <ol>. `highlight` is the `date` of an entry to emphasise. */
export function boardHtml(board, highlight = 0) {
  if (!board.length) return '<li class="muted">No scores yet. Be the first!</li>';
  const medals = ['🥇', '🥈', '🥉'];
  return board.map((e, i) =>
    `<li class="${e.date === highlight ? 'me' : ''}"><span>${medals[i] || i + 1 + '.'}</span><span class="nm">${esc(e.name)}</span><b>${e.score}</b></li>`).join('');
}
