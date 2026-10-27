// ui.js — tiny shared UI helpers (toasts + HTML escaping).

/** Escape text before putting it into innerHTML. */
export function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Show a toast. type: 'success' | 'error' | 'info'.
 * Pass {html:true} only for trusted markup (e.g. a link to Settings).
 */
export function toast(message, type = 'info', { html = false, duration = 4000 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'status');
  if (html) el.innerHTML = message; else el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast--out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600); // safety net if the animation never fires
  }, duration);
}
