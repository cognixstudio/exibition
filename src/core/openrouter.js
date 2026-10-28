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
  const model = (opts.model ?? s.model).trim() || 'google/gemini-3.8-flash';
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

  const post = async (messages, extra = {}) => {
    let r;
    try {
      r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': location.origin,
          'X-Title': 'Gesture Lab',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? s.temperature,
          ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
          ...extra,
        }),
      });
    } catch (err) {
      throw new AIError('Could not reach OpenRouter. Check your internet connection.', 'NETWORK');
    }
    let d = null;
    try { d = await r.json(); } catch { /* non-JSON body */ }
    return [r, d];
  };

  let [res, data] = await post(msgs);

  // Some models reject the "system" role (HTTP 400). Retry once with it folded into the first user message.
  if (res.status === 400 && msgs.some((m) => m.role === 'system')) {
    const sys = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const rest = msgs.filter((m) => m.role !== 'system');
    const i = rest.findIndex((m) => m.role === 'user');
    if (i >= 0) {
      const c = rest[i].content;
      rest[i] = { ...rest[i], content: Array.isArray(c) ? [{ type: 'text', text: `${sys}\n\n${c[0]?.text || ''}` }, ...c.slice(1)] : `${sys}\n\n${c}` };
      [res, data] = await post(rest);
    }
  }

  if (!res.ok) {
    const detail = data?.error?.message || res.statusText || 'Unknown error';
    if (res.status === 401) throw new AIError('OpenRouter rejected the API key. Double-check it in Settings.', 'AUTH');
    if (res.status === 402) throw new AIError('Your OpenRouter account is out of credits.', 'CREDITS');
    if (res.status === 429) throw new AIError('Rate limited by OpenRouter. Wait a moment and retry.', 'RATE');
    throw new AIError(`OpenRouter error (${res.status}): ${detail}`, 'API');
  }

  // Content can be a string or a list of parts; reasoning models may leave it empty.
  const extract = (d) => {
    const c = d?.choices?.[0]?.message?.content;
    if (Array.isArray(c)) return c.map((p) => p?.text || '').join('').trim();
    return typeof c === 'string' ? c.trim() : '';
  };
  let text = extract(data);

  // Reasoning models (e.g. "...-vl:free", "thinking") can spend a small token budget on thinking and
  // return nothing. Retry once with a much bigger budget and low reasoning effort.
  if (!text && res.ok) {
    const big = Math.max((opts.maxTokens || 200) * 8, 1200);
    const [r2, d2] = await post(msgs, { max_tokens: big, reasoning: { effort: 'low' } });
    if (r2.ok) { text = extract(d2); data = d2; }
  }

  if (!text) {
    const why = data?.choices?.[0]?.finish_reason === 'length' ? ' (it ran out of tokens while thinking)' : '';
    throw new AIError(data?.error?.message || `The model returned an empty reply${why}. Try another model in Settings, such as google/gemini-3.8-flash.`, 'API');
  }
  return text;
}
