// storage.js — thin localStorage wrapper for all app settings.
// Everything lives under ONE key so Reset is a single removal.

const KEY = 'gesture-lab:settings';

export const DEFAULTS = Object.freeze({
  apiKey: '',
  model: 'google/gemini-3.8-flash',
  temperature: 0.7,
  cameraId: '',      // '' = browser default camera
  mirror: true,
  speech: true,
  demo: false,       // use canned AI answers (exhibitions / offline)
  hcSensitivity: 1,  // hand-control cursor sensitivity (0.5 - 2)
  hcDwell: 1.3,      // hand-control dwell-click time in seconds (0 = off)
  shareUrl: '',      // public link shown as a QR code ('' = this page's address)
});

/** Read all settings, merged over defaults. Never throws. */
export function getSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    const s = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
    if (s.model === 'google/gemini-2.0-flash-001') s.model = DEFAULTS.model; // retired model: upgrade automatically
    return s;
  } catch (err) {
    console.warn('Could not read settings, using defaults.', err);
    return { ...DEFAULTS };
  }
}

/** Address encoded in QR codes: the saved public link, else this page without the #route. */
export const shareUrl = () => (getSettings().shareUrl || location.href.split('#')[0]).trim();

export const getSetting = (name) => getSettings()[name];

/** Merge a partial object into saved settings. Returns true on success. */
export function saveSettings(partial) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), ...partial }));
    return true;
  } catch (err) {
    console.error('Could not save settings.', err);
    return false;
  }
}

/** Remove saved settings (back to defaults). */
export function resetSettings() {
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch (err) {
    console.error('Could not reset settings.', err);
    return false;
  }
}
