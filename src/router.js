// router.js — hash-based router. Each page module exports
// render(container) and may return a cleanup function (stop camera, timers…).

const routes = {
  '/home': () => import('./pages/home.js'),
  '/draw': () => import('./pages/draw.js'),
  '/game': () => import('./pages/game.js'),
  '/strike': () => import('./pages/strike.js'),
  '/sign': () => import('./pages/sign.js'),
  '/buddy': () => import('./pages/buddy.js'),
  '/settings': () => import('./pages/settings.js'),
};

let cleanup = null;
let token = 0; // guards against fast navigation races

function currentPath() {
  const p = location.hash.replace(/^#/, '') || '/home';
  return routes[p] ? p : '/home';
}

async function navigate() {
  const path = currentPath();
  const mine = ++token;
  const app = document.getElementById('app');

  // Leave the previous page cleanly.
  try { if (typeof cleanup === 'function') await cleanup(); } catch (e) { console.warn(e); }
  cleanup = null;

  document.querySelectorAll('#navbar a[data-route]').forEach((a) => {
    const on = a.dataset.route === path;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  app.innerHTML = '<div class="skeleton page-skeleton"></div>';
  try {
    const page = await routes[path]();
    if (mine !== token) return; // user already went elsewhere
    app.innerHTML = '';
    app.dataset.page = path.slice(1);
    cleanup = (await page.render(app)) || null;
    document.title = `Gesture Lab · ${path.slice(1)}`;
  } catch (err) {
    console.error(err);
    if (mine !== token) return;
    app.innerHTML = `<section class="card error-state"><h2>Something went wrong</h2>
      <p>This page failed to load. Check your connection and try again.</p>
      <button class="btn primary" id="retry">Try again</button></section>`;
    document.getElementById('retry')?.addEventListener('click', navigate);
  }
}

export function startRouter() {
  window.addEventListener('hashchange', navigate);
  if (!location.hash) location.hash = '#/home'; // triggers hashchange
  else navigate();
}
