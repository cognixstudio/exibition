// openrouter.js — calls OpenRouter straight from the browser.
import { getSettings } from './storage.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Error with a machine-readable code (NO_KEY, AUTH, CREDITS, RATE, NETWORK, API). */
export class AIError extends Error {
  constructor(message, code = 'API') {
    super(message);
    this.name = 'AIError';
    this.code = code;
  }
}

/** Friendly HTML for the "no key" case — links to Settings. */
export const NO_KEY_HTML =
  'No OpenRouter API key yet. Add one in <a href="#/settings">Settings</a>.';

/**
 * Ask the model.
 * @param {Array<{role:string, content:string}>} messages  chat messages
 * @param {Object} [opts]
 * @param {string} [opts.image]  base64 image (raw or data: URL), attached to the last user message
 * @param {string} [opts.apiKey] @param {string} [opts.model]
 * @param {number} [opts.temperature] @param {number} [opts.maxTokens]  overrides (used by Test Connection)
 * @returns {Promise<string>} the reply text
 */
export async function askAI(messages, opts = {}) {
  const s = getSettings();
  const apiKey = (opts.apiKey ?? s.apiKey).trim();
  const model = (opts.model ?? s.model).trim() || 'google/gemini-2.0-flash-001';
  if (!apiKey) throw new AIError('No OpenRouter API key set.', 'NO_KEY');

  // Copy messages; turn the last user message into text + image parts if an image is given.
  const msgs = messages.map((m) => ({ ...m }));
  if (opts.image) {
    const url = opts.image.startsWith('data:') ? opts.image : `data:image/jpeg;base64,${opts.image}`;
    let i = msgs.length - 1;
    while (i >= 0 && msgs[i].role !== 'user') i--;
    if (i < 0) { msgs.push({ role: 'user', content: '' }); i = msgs.length - 1; }
    msgs[i].content = [
      { type: 'text', text: String(msgs[i].content || '') },
      { type: 'image_url', image_url: { url } },
    ];
  }

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': 'Gesture Lab',
      },
      body: JSON.stringify({
        model,
        messages: msgs,
        temperature: opts.temperature ?? s.temperature,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });
  } catch (err) {
    throw new AIError('Could not reach OpenRouter. Check your internet connection.', 'NETWORK');
  }

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }

  if (!res.ok) {
    const detail = data?.error?.message || res.statusText || 'Unknown error';
    if (res.status === 401) throw new AIError('OpenRouter rejected the API key. Double-check it in Settings.', 'AUTH');
    if (res.status === 402) throw new AIError('Your OpenRouter account is out of credits.', 'CREDITS');
    if (res.status === 429) throw new AIError('Rate limited by OpenRouter. Wait a moment and retry.', 'RATE');
    throw new AIError(`OpenRouter error (${res.status}): ${detail}`, 'API');
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new AIError(data?.error?.message || 'The model returned an empty reply.', 'API');
  }
  return text.trim();
}
