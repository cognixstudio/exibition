// main.js — app entry: styles, navbar, router, shortcuts, Exhibition mode.
import './styles.css';
import { startRouter } from './router.js';
import { toast } from './core/ui.js';

const links = [
  ['/home', 'Home'],
  ['/draw', 'Air Draw'],
  ['/game', 'Game'],
  ['/sign', 'Sign'],
  ['/buddy', 'Zippy'],
  ['/settings', 'Settings'],
];

function buildNavbar() {
  const nav = document.getElementById('navbar');
  nav.className = 'navbar';
  nav.innerHTML = `
    <a class="brand" href="#/home"><span class="brand-dot"></span>Gesture Lab</a>
    <nav aria-label="Main">
      ${links.map(([p, l]) => `<a data-route="${p}" href="#${p}">${l}</a>`).join('')}
    </nav>
    <button class="btn ghost nav-btn" id="exhibitBtn" aria-pressed="false" title="Exhibition mode (Alt+E)" aria-label="Exhibition mode">⛶</button>`;

  const exit = document.createElement('button');
  exit.id = 'exitExhibit';
  exit.className = 'btn ghost exit-exhibit';
  exit.textContent = 'Exit exhibition';
  exit.hidden = true;
  document.body.appendChild(exit);
  document.getElementById('exhibitBtn').addEventListener('click', () => setExhibition(!isExhibition()));
  exit.addEventListener('click', () => setExhibition(false));
}

// ---------- Exhibition mode: hides the navbar and goes fullscreen ----------
const isExhibition = () => document.body.classList.contains('exhibition');

function setExhibition(on) {
  document.body.classList.toggle('exhibition', on);
  document.getElementById('exhibitBtn')?.setAttribute('aria-pressed', String(on));
  const exit = document.getElementById('exitExhibit');
  if (exit) exit.hidden = !on;
  try {
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  } catch { /* fullscreen not supported: the hidden navbar still works */ }
}

// Leaving fullscreen with Esc should also leave Exhibition mode.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && isExhibition()) setExhibition(false);
});

// ---------- Keyboard shortcuts (Alt+S = Settings, Alt+E = Exhibition) ----------
window.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.code === 'KeyS') { e.preventDefault(); location.hash = '#/settings'; }
    else if (e.code === 'KeyE') { e.preventDefault(); setExhibition(!isExhibition()); }
  } else if (e.key === 'Escape' && isExhibition() && !document.fullscreenElement) {
    setExhibition(false);
  }
});

// ---------- Offline awareness: gestures keep working, AI falls back to demo answers ----------
window.addEventListener('offline', () => toast('You are offline. Gestures still work; AI answers will be demo answers.', 'info', { duration: 6000 }));
window.addEventListener('online', () => toast('Back online.', 'success'));

buildNavbar();
startRouter();
if (!navigator.onLine) window.dispatchEvent(new Event('offline'));

window.__booted = true; // tells index.html the app started fine
