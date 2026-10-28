// settings.js — API key, model, temperature, camera, toggles.
import { getSettings, saveSettings, resetSettings, DEFAULTS } from '../core/storage.js';
import { askAI, AIError, NO_KEY_HTML } from '../core/openrouter.js';
import { toast, esc } from '../core/ui.js';

const SUGGESTED_MODELS = [
  'google/gemini-3.8-flash',
  'google/gemini-3.7-flash',
  'google/gemini-3.6-flash',
];

export function render(container) {
  const s = getSettings();

  container.innerHTML = `
  <section class="page narrow">
    <h1>Settings</h1>
    <p class="muted">Everything is saved in this browser only.</p>

    <form class="card form" id="settings-form" autocomplete="off" novalidate>
      <div class="field">
        <label for="apiKey">OpenRouter API key</label>
        <div class="input-row">
          <input id="apiKey" type="password" placeholder="sk-or-v1-…" spellcheck="false" value="${esc(s.apiKey)}" />
          <button type="button" class="btn ghost" id="toggleKey" aria-pressed="false">Show</button>
        </div>
        <p class="hint">Stored only in this browser and never sent anywhere except OpenRouter.</p>
      </div>

      <div class="field">
        <label for="model">Model</label>
        <input id="model" type="text" list="models" spellcheck="false" value="${esc(s.model)}" />
        <datalist id="models">${SUGGESTED_MODELS.map((m) => `<option value="${m}"></option>`).join('')}</datalist>
        <p class="hint">Use a vision-capable model for Air Draw and Sign Translator. Model names change often: copy the exact ID from <a href="https://openrouter.ai/models" target="_blank" rel="noopener">openrouter.ai/models</a>.</p>
      </div>

      <div class="field">
        <label for="shareUrl">Public link for QR codes (optional)</label>
        <input id="shareUrl" type="url" placeholder="https://yourname.github.io/gesture-lab/" value="${(s.shareUrl || '').replace(/"/g, '&quot;')}" />
        <p class="hint">Shown as a QR code on the leaderboard and the attract screen. Leave empty to use this page's address (no use for phones while on localhost).</p>
      </div>

      <div class="field">
        <label for="temperature">Temperature <output id="tempOut">${s.temperature}</output></label>
        <input id="temperature" type="range" min="0" max="1.5" step="0.1" value="${s.temperature}" />
      </div>

      <div class="field">
        <label for="hcSens">Hand control sensitivity <output id="hcSensOut">${s.hcSensitivity}×</output></label>
        <input id="hcSens" type="range" min="0.5" max="2" step="0.1" value="${s.hcSensitivity}" />
        <p class="hint">Higher = the cursor crosses the screen with smaller hand movements.</p>
      </div>

      <div class="field">
        <label for="hcDwell">Hand control dwell click <output id="hcDwellOut">${Number(s.hcDwell) === 0 ? 'Off' : s.hcDwell + ' s'}</output></label>
        <input id="hcDwell" type="range" min="0" max="3" step="0.1" value="${s.hcDwell}" />
        <p class="hint">How long to hold still over a button to click it. Set to 0 to turn dwell off (pinch only).</p>
      </div>

      <div class="field">
        <label for="camera">Camera</label>
        <div class="input-row">
          <select id="camera"><option value="">Default camera</option></select>
          <button type="button" class="btn ghost" id="refreshCams">Detect cameras</button>
        </div>
        <p class="hint" id="camHint">Camera names appear after you allow camera access.</p>
      </div>

      <label class="switch"><input type="checkbox" id="mirror" ${s.mirror ? 'checked' : ''} />
        <span class="track"></span><span>Mirror camera</span></label>
      <label class="switch"><input type="checkbox" id="speech" ${s.speech ? 'checked' : ''} />
        <span class="track"></span><span>Speech output</span></label>
      <label class="switch"><input type="checkbox" id="demo" ${s.demo ? 'checked' : ''} />
        <span class="track"></span><span>Demo mode (canned AI answers, no network calls)</span></label>

      <div class="test-row">
        <button type="button" class="btn ghost" id="testBtn">Test connection</button>
        <span id="testResult" class="test-result" role="status"></span>
      </div>

      <div class="actions">
        <button type="submit" class="btn primary">Save</button>
        <button type="button" class="btn ghost" id="resetBtn">Reset to defaults</button>
      </div>
    </form>
    <p class="hint">Shortcuts: <kbd>Alt</kbd>+<kbd>S</kbd> opens Settings, <kbd>Alt</kbd>+<kbd>E</kbd> toggles Exhibition mode, <kbd>Alt</kbd>+<kbd>H</kbd> toggles Hand control.</p>
  </section>`;

  const $ = (id) => container.querySelector('#' + id);

  // ---- show/hide key
  $('toggleKey').addEventListener('click', (e) => {
    const show = $('apiKey').type === 'password';
    $('apiKey').type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Hide' : 'Show';
    e.currentTarget.setAttribute('aria-pressed', String(show));
  });

  $('temperature').addEventListener('input', () => { $('tempOut').textContent = $('temperature').value; });
  $('hcSens').addEventListener('input', () => { $('hcSensOut').textContent = `${$('hcSens').value}×`; });
  $('hcDwell').addEventListener('input', () => { $('hcDwellOut').textContent = Number($('hcDwell').value) === 0 ? 'Off' : `${$('hcDwell').value} s`; });

  // ---- cameras
  async function loadCameras({ askPermission = false } = {}) {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error('unsupported');
      if (askPermission) {
        // A brief stream unlocks device labels; stop it right away.
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
        tmp.getTracks().forEach((t) => t.stop());
      }
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const saved = getSettings().cameraId;
      $('camera').innerHTML = '<option value="">Default camera</option>' + cams.map((c, i) =>
        `<option value="${esc(c.deviceId)}" ${c.deviceId === saved ? 'selected' : ''}>${esc(c.label || `Camera ${i + 1}`)}</option>`).join('');
      $('camHint').textContent = cams.length ? `${cams.length} camera(s) found.` : 'No camera found.';
    } catch (err) {
      const denied = err?.name === 'NotAllowedError';
      $('camHint').textContent = denied
        ? 'Camera access was blocked. Allow it in the browser address bar, then try again.'
        : 'Could not list cameras on this device.';
    }
  }
  $('refreshCams').addEventListener('click', () => loadCameras({ askPermission: true }));
  loadCameras();

  // ---- test connection (uses the form values, even if unsaved)
  $('testBtn').addEventListener('click', async () => {
    const btn = $('testBtn'), out = $('testResult');
    btn.disabled = true;
    out.className = 'test-result';
    out.textContent = 'Testing…';
    try {
      const reply = await askAI([{ role: 'user', content: 'Reply with the single word: pong' }], {
        apiKey: $('apiKey').value, model: $('model').value, temperature: 0, maxTokens: 10,
      });
      out.classList.add('ok');
      out.textContent = `Connected. Model replied: ${reply.slice(0, 30)}`;
      toast('Connection works.', 'success');
    } catch (err) {
      out.classList.add('bad');
      if (err instanceof AIError && err.code === 'NO_KEY') {
        out.textContent = 'Enter an API key first.';
        toast(NO_KEY_HTML, 'error', { html: true });
      } else {
        out.textContent = err.message || 'Connection failed.';
        toast(err.message || 'Connection failed.', 'error');
      }
    } finally {
      btn.disabled = false;
    }
  });

  // ---- save / reset
  $('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = saveSettings({
      apiKey: $('apiKey').value.trim(),
      model: $('model').value.trim() || DEFAULTS.model,
      temperature: parseFloat($('temperature').value),
      hcSensitivity: parseFloat($('hcSens').value),
      hcDwell: parseFloat($('hcDwell').value),
      cameraId: $('camera').value,
      mirror: $('mirror').checked,
      speech: $('speech').checked,
      demo: $('demo').checked,
      shareUrl: $('shareUrl').value.trim(),
    });
    toast(ok ? 'Settings saved.' : 'Could not save. Browser storage may be blocked.', ok ? 'success' : 'error');
  });

  $('resetBtn').addEventListener('click', () => {
    if (!resetSettings()) return toast('Could not reset settings.', 'error');
    render(container);
    toast('Settings reset to defaults.', 'info');
  });
}
