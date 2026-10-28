// demo.js — canned "AI" answers for when the API key is missing, the network is down,
// the request fails, or Demo mode is switched on in Settings. Gestures keep working.
import { getSettings } from './storage.js';
import { AIError } from './openrouter.js';

const rand = (a) => a[Math.floor(Math.random() * a.length)];

const GUESSES = [
  ['a house', 'The oldest known house-like shelters are over 400,000 years old.'],
  ['a smiling sun', 'The Sun holds about 99.8% of all the mass in our solar system.'],
  ['a cat', 'Cats sleep roughly 12 to 16 hours a day.'],
  ['a flower', 'Young sunflowers turn their heads to follow the sun.'],
  ['a star', 'Starlight you see tonight can be thousands of years old.'],
  ['a tree', 'Trees share nutrients underground through fungal networks.'],
];
export const pickGuess = () => rand(GUESSES);

/** Offline stand-in for "AI Fix": tidy spaces, fix "i", capitalise, add a full stop. */
export function localFix(text) {
  let t = text.replace(/\s+/g, ' ').trim().toLowerCase().replace(/\bi\b/g, 'I');
  if (!t) return t;
  t = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(t) ? t : t + '.';
}

/**
 * Run an AI call; if Demo mode is on or the call fails with an AIError, use `demo()` instead.
 * Resolves to { text, demo } so callers can tell the person it was a demo answer.
 * Non-AI errors are re-thrown.
 */
export async function aiOrDemo(run, demo) {
  if (getSettings().demo) return { text: demo(), demo: true, reason: 'Demo mode is switched on in Settings.' };
  try {
    return { text: await run(), demo: false };
  } catch (err) {
    if (err instanceof AIError) {
      const reason = err.code === 'NO_KEY' ? 'No API key is saved yet. Enter it in Settings and press Save.' : err.message;
      return { text: demo(), demo: true, error: err, reason };
    }
    throw err;
  }
}
