// storage.js — thin localStorage wrapper for all app settings.
// Everything lives under ONE key so Reset is a single removal.

const KEY = 'gesture-lab:settings';

export const DEFAULTS = Object.freeze({
  apiKey: '',
  model: 'google/gemini-2.0-flash-001',
  temperature: 0.7,
  cameraId: '',      // '' = browser default camera
  mirror: true,
  speech: true,
  demo: false,       // use canned AI answers (exhibitions / offline)
});

/** Read all settings, merged over defaults. Never throws. */
export function getSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch (err) {
    console.warn('Could not read settings, using defaults.', err);
    return { ...DEFAULTS };
  }
}

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
