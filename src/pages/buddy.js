// buddy.js — Zippy, a live talking AI buddy: speak or type, it talks back, jokes and teases (kindly).
// Voice in = Web Speech API (Chrome/Edge). Voice out = SpeechSynthesis. Brain = OpenRouter, with canned fallback.
import { getSettings } from '../core/storage.js';
import { askAI } from '../core/openrouter.js';
import { aiOrDemo } from '../core/demo.js';
import { toast } from '../core/ui.js';
import { getTracker } from '../core/handTracker.js';
import { startCamera, stopCamera, applyMirror } from '../core/camera.js';
import { pingActivity } from '../core/attract.js';
import { CHARACTERS, CHAR_ORDER, pickVoice } from '../core/characters.js';

const LANGS = [['en-US', 'English'], ['hi-IN', 'Hindi'], ['ta-IN', 'Tamil'], ['te-IN', 'Telugu'], ['es-ES', 'Spanish'], ['fr-FR', 'French']];
const QUICK = [
  ['😂 Joke', 'Tell me a really funny joke.'],
  ['🔥 Roast me', 'Give me a gentle, friendly roast. Keep it kind.'],
  ['🤓 Fun fact', 'Tell me a weird, fun fact.'],
  ['🧩 Riddle', 'Give me a short riddle and wait for my answer.'],
];
const STATUS = { idle: 'Ready', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Talking…' };

// ---- offline / demo brain
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const JOKES = [
  'Why did the scarecrow win an award? Because he was outstanding in his field.',
  'I told my computer I needed a break. Now it sends me vacation ads, which is not what I meant.',
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'I would tell you a UDP joke, but you might not get it.',
  'What do you call a fake noodle? An impasta.',
];
const ROASTS = [
  'You wave your hands at a camera for fun. Honestly, that is already the plot of my favorite comedy.',
  'Your secret talent is making a robot feel overdressed. Lovely hair though, from what my pixels tell me.',
];
const FACTS = [
  'Octopuses have three hearts, which is two more than I have, and I am still emotionally invested in you.',
  'Honey never spoils. Archaeologists found edible honey in ancient Egyptian tombs.',
  'Bananas are berries, but strawberries are not. Fruit is wild.',
];
const RIDDLES = [
  'What has hands but cannot clap? A clock. Your turn, give me your best guess next time!',
  'What gets wetter the more it dries? A towel. Got another one in my circuits if you want it.',
];
const FALLBACK = [
  'Great question! My brain is in demo mode, so here is a joke instead: why did the scarecrow win an award? He was outstanding in his field.',
  'I would answer that properly, but my cloud brain is offline. Ask me for a joke, a fact, a riddle, or a roast!',
];
function demoReply(t) {
  const s = t.toLowerCase();
  if (/joke|funny|laugh|pun/.test(s)) return rand(JOKES);
  if (/roast/.test(s)) return rand(ROASTS);
  if (/fact/.test(s)) return rand(FACTS);
  if (/riddle/.test(s)) return rand(RIDDLES);
  if (/\b(hi|hello|hey|namaste)\b/.test(s)) return ch.hi;
  if (/name|who are you/.test(s)) return ch.hi;
  return rand(FALLBACK);
}

// Hand gestures the characters react to (camera is optional and off by default).
const REACT = {
  Open_Palm:   { emoji: '👋', fx: '👋', label: 'a wave hello', mood: 'happy', demo: ['Hey! I saw that wave. Hello to you too!', 'A wave! My favorite greeting after a good joke.'] },
  Thumb_Up:    { emoji: '👍', fx: '👍', label: 'a thumbs up', mood: 'happy', demo: ['Thumbs up! I will take that as a five star review.', 'Yes! Approval received, ego fully charged.'] },
  Victory:     { emoji: '✌️', fx: '✌️', label: 'a peace sign', mood: 'happy', demo: ['Peace! Or are you saying two more jokes? Either way, nice.', 'Victory sign! Did you win something, or are you just fabulous?'] },
  Closed_Fist: { emoji: '✊', fx: '💥', label: 'a clenched fist', mood: 'scared', demo: ['Whoa, a fist! I surrender, take all my jokes!', 'Easy there, champ! Save that for rock paper scissors.'] },
  ILoveYou:    { emoji: '🤟', fx: '❤️', label: 'an I love you sign', mood: 'happy', demo: ['Aww, I love you too, in a totally friendly way!', 'That is the best sign ever. Right back at you!'] },
  Pointing_Up: { emoji: '☝️', fx: '❓', label: 'a pointing finger', mood: 'happy', demo: ['Ooh, one finger up! Do you have a question for me?', 'Pointing at the sky? Or asking for one more joke?'] },
};

const CHAR_KEY = 'gesture-lab:buddy-char';
function loadChar() {
  try { const v = localStorage.getItem(CHAR_KEY); return CHARACTERS[v] ? v : 'zippy'; } catch { return 'zippy'; }
}
let ch = CHARACTERS.zippy; // the active character

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export function render(container) {
  container.innerHTML = `
  <section class="page buddy">
    <h1 id="title">Talk to Zippy</h1>
    <p class="muted">Pick a character, then speak or type. They talk back, joke and tease (kindly).</p>

    <div class="buddy-grid">
      <div class="card buddy-side">
        <div class="char-picker" id="picker" role="radiogroup" aria-label="Choose a character"></div>
        <div class="buddy-avatar" id="avatar" data-state="idle"></div>
        <p class="buddy-status" id="status" aria-live="polite">Ready</p>
        <button class="btn primary" id="wakeBtn">Wake up Zippy</button>
        <div class="buddy-opts">
          <select id="lang" aria-label="Language">${LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select>
          <label class="switch"><input type="checkbox" id="live" ${SR ? 'checked' : 'disabled'} />
            <span class="track"></span><span>Live conversation</span></label>
          <label class="switch"><input type="checkbox" id="react" />
            <span class="track"></span><span>Gesture reactions (camera)</span></label>
        </div>
        <div class="pip" id="pip" hidden>
          <video id="pipVideo" muted playsinline></video>
          <span id="pipLabel">Starting camera…</span>
        </div>
        <p class="hint" id="note"></p>
      </div>

      <div class="card buddy-chat">
        <div class="chat" id="chat" aria-live="polite"></div>
        <div class="chips quick">${QUICK.map(([l, p]) => `<button type="button" class="chip btn-chip" data-p="${p}">${l}</button>`).join('')}</div>
        <form class="chat-form" id="form" autocomplete="off">
          <button type="button" class="btn ghost mic" id="micBtn" aria-label="Speak" title="Speak">🎤</button>
          <input id="input" type="text" placeholder="Say something funny…" aria-label="Message" />
          <button class="btn primary" type="submit">Send</button>
        </form>
      </div>
    </div>
  </section>`;

  const $ = (id) => container.querySelector('#' + id);
  let active = true, state = 'idle', busy = false, chatId = 0, rec = null, listening = false, noSpeech = 0, speakId = 0, awake = false, demoShown = false;
  const history = [];
  const lang = () => $('lang').value;
  const langName = () => $('lang').selectedOptions[0].textContent;

  if (!SR) $('note').textContent = 'Voice input needs Chrome or Edge. You can still type, and Zippy will still talk.';

  function setState(s) {
    state = s;
    $('avatar').dataset.state = s;
    $('status').textContent = STATUS[s];
    $('micBtn').classList.toggle('on', s === 'listening');
  }

  function addMsg(who, text) {
    const el = document.createElement('div');
    el.className = `msg ${who}`;
    el.textContent = text;
    const chat = $('chat');
    chat.appendChild(el);
    while (chat.children.length > 60) chat.firstChild.remove();
    chat.scrollTop = chat.scrollHeight;
  }

  // ---------- talking ----------
  const stripEmoji = (t) => t.replace(/[\u{1F000}-\u{1FFFF}\u2600-\u27BF\uFE0F]/gu, '').trim();

  /** Speaks text; resolves true if it finished, false if it was interrupted. */
  function speak(text) {
    const id = ++speakId;
    const clean = stripEmoji(text);
    const canSpeak = getSettings().speech && 'speechSynthesis' in window;
    if (!canSpeak) { // no voice: still animate the mouth for a believable duration
      setState('speaking');
      return new Promise((res) => setTimeout(() => { if (id === speakId) { setState('idle'); res(true); } else res(false); },
        Math.min(6000, 600 + clean.length * 45)));
    }
    return new Promise((res) => {
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = lang(); u.pitch = ch.pitch; u.rate = ch.rate;
      const v = pickVoice(speechSynthesis.getVoices(), lang(), ch.voice);
      if (v) u.voice = v;
      const done = () => { if (id !== speakId) return res(false); if (state === 'speaking') setState('idle'); res(true); };
      u.onstart = () => { if (id === speakId) setState('speaking'); };
      u.onend = done; u.onerror = done;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
  }
  function stopSpeaking() {
    speakId++;
    try { speechSynthesis.cancel(); } catch { /* unsupported */ }
    if (state === 'speaking') setState('idle');
  }

  // ---------- listening ----------
  function stopListening() {
    if (rec) { rec.onend = null; try { rec.abort(); } catch { /* already stopped */ } rec = null; }
    listening = false;
    if (state === 'listening') setState('idle');
  }

  function listen() {
    if (!SR) return toast('Voice input is not supported in this browser. Use Chrome or Edge, or type.', 'info');
    if (busy || listening) return;
    stopSpeaking();
    let finalText = '';
    rec = new SR();
    rec.lang = lang(); rec.interimResults = true; rec.continuous = false;
    rec.onstart = () => { listening = true; setState('listening'); };
    rec.onresult = (e) => {
      let t = '';
      for (const r of e.results) t += r[0].transcript;
      finalText = t; $('input').value = t;
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        $('live').checked = false;
        toast('Microphone access was blocked. Allow it in the address bar, or type instead.', 'error');
      } else if (e.error === 'no-speech') noSpeech++;
      else if (e.error !== 'aborted') toast(`Voice input problem: ${e.error}`, 'error');
    };
    rec.onend = () => {
      listening = false; rec = null;
      if (!active) return;
      if (state === 'listening') setState('idle');
      const t = finalText.trim();
      $('input').value = '';
      if (t) { noSpeech = 0; send(t); return; }
      if ($('live').checked && !busy) {
        if (noSpeech >= 3) { $('live').checked = false; noSpeech = 0; toast('Live chat paused. I did not hear anything.', 'info'); }
        else setTimeout(() => { if (active && $('live').checked && !busy && !listening) listen(); }, 300);
      }
    };
    try { rec.start(); } catch (err) { console.warn(err); rec = null; }
  }

  // ---------- conversation ----------
  async function send(text, opts = {}) {
    text = text.trim();
    if (!text || busy) return;
    stopListening(); stopSpeaking();
    awake = true; $('wakeBtn').hidden = true; pingActivity();
    addMsg(opts.gesture ? 'gesture' : 'user', opts.gesture ? `${opts.gesture.emoji} You showed ${opts.gesture.label}` : text);
    history.push({ role: 'user', content: text });
    busy = true; setState('thinking');
    const cid = chatId; // ignore the answer if the character changes meanwhile

    const system = { role: 'system', content:
      ch.persona + ' ' +
      'Rules: reply in 1 to 3 short sentences (under 45 words). Be funny but always kind, never mean or rude. No emojis, no markdown, no lists. ' +
      'Answer real questions helpfully first, then add a quick joke when it fits. If asked for a riddle, wait for the answer. ' +
      `Reply in ${langName()}.` };
    let reply;
    try {
      const r = await aiOrDemo(() => askAI([system, ...history.slice(-12)], { maxTokens: 150, temperature: 1 }), () => ch.flavor(opts.demo ? opts.demo() : demoReply(text)));
      reply = r.text.split('\n').filter(Boolean).join(' ').trim();
      if (r.demo) {
        $('note').textContent = `Demo answer. ${r.reason} `;
        const a = document.createElement('a'); a.href = '#/settings'; a.textContent = 'Open Settings';
        $('note').appendChild(a);
      } else $('note').textContent = '';
    } catch (err) {
      console.warn(err);
      reply = ch.flavor(opts.demo ? opts.demo() : demoReply(text));
    }
    if (!active || cid !== chatId) return;
    history.push({ role: 'assistant', content: reply });
    addMsg('bot', reply);
    busy = false;
    const finished = await speak(reply);
    if (active && finished && $('live').checked) listen();
  }

  // ---------- gesture reactions ----------
  let unsubReact = null, cand = 'None', since = 0, lastReact = 0;

  function floatEmoji(fx) {
    const av = $('avatar');
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('span');
      s.className = 'float-emoji';
      s.textContent = fx;
      s.style.left = `${10 + Math.random() * 75}%`;
      s.style.animationDelay = `${i * 0.12}s`;
      av.appendChild(s);
      setTimeout(() => s.remove(), 2200);
    }
  }

  function react(g) {
    const r = REACT[g];
    floatEmoji(r.fx);
    const av = $('avatar');
    av.dataset.mood = r.mood;
    setTimeout(() => { if (active) delete av.dataset.mood; }, 1800);
    send(`[The person just showed you ${r.label} with their hand, without speaking. React in character with one short, fun sentence.]`,
      { gesture: r, demo: () => rand(r.demo) });
  }

  function onHands({ hands, timestamp }) {
    const g = hands[0]?.gesture || 'None', r = REACT[g];
    const label = r ? `${r.emoji} ${g.replace('_', ' ')}` : hands.length ? '🖐️ …' : 'Show me a gesture!';
    if ($('pipLabel').textContent !== label) $('pipLabel').textContent = label;
    if (hands.length) pingActivity();
    if (g !== cand) { cand = g; since = timestamp; return; }       // must hold the gesture for 0.6 s
    if (!r || timestamp - since < 600 || timestamp - lastReact < 6000) return; // and wait 6 s between reactions
    if (busy || state === 'speaking' || $('input').value) return;
    lastReact = timestamp;
    react(g);
  }

  async function setReactions(on) {
    const tracker = getTracker(), video = $('pipVideo');
    if (!on) {
      unsubReact?.(); unsubReact = null;
      tracker.stop(); stopCamera(video); $('pip').hidden = true;
      return;
    }
    try {
      $('pip').hidden = false; $('pipLabel').textContent = 'Starting camera…';
      await tracker.init();
      await startCamera(video);
      if (!active || !$('react').checked) { stopCamera(video); return; }
      applyMirror($('pip'));
      unsubReact = tracker.onResult(onHands);
      tracker.start(video);
      $('pipLabel').textContent = 'Show me a gesture!';
    } catch (err) {
      console.warn(err);
      $('react').checked = false; $('pip').hidden = true; stopCamera(video);
      toast(err?.message || 'Could not start the camera.', 'error');
    }
  }

  // ---------- characters ----------
  function renderPicker() {
    $('picker').innerHTML = CHAR_ORDER.map((id) => `<button type="button" class="char-btn${id === ch.id ? ' on' : ''}" role="radio" aria-checked="${id === ch.id}" data-id="${id}"><span aria-hidden="true">${CHARACTERS[id].emoji}</span> ${CHARACTERS[id].name}</button>`).join('');
  }

  function setCharacter(id) {
    ch = CHARACTERS[id] || CHARACTERS.zippy;
    try { localStorage.setItem(CHAR_KEY, ch.id); } catch { /* storage blocked */ }
    chatId++; busy = false; noSpeech = 0;
    stopListening(); stopSpeaking(); setState('idle');
    history.length = 0; $('chat').innerHTML = '';
    $('avatar').innerHTML = ch.svg;
    $('title').textContent = `Talk to ${ch.name}`;
    $('wakeBtn').textContent = `Wake up ${ch.name}`;
    renderPicker();
    if (!awake) { addMsg('bot', `Press "Wake up ${ch.name}" to hear me, or just type a message.`); return; }
    addMsg('bot', ch.hi);
    speak(ch.hi).then((done) => { if (active && done && $('live').checked) listen(); });
  }

  // ---------- wiring ----------
  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('input').value; $('input').value = '';
    send(t);
  });
  container.querySelectorAll('.btn-chip').forEach((b) => b.addEventListener('click', () => send(b.dataset.p)));
  $('micBtn').addEventListener('click', () => {
    if (listening && rec) rec.stop(); // finishes the sentence, then sends it
    else listen();
  });
  $('live').addEventListener('change', () => {
    if ($('live').checked) { noSpeech = 0; if (state === 'idle') listen(); } else stopListening();
  });
  $('lang').addEventListener('change', () => { stopListening(); stopSpeaking(); });
  $('react').addEventListener('change', () => setReactions($('react').checked));

  $('wakeBtn').addEventListener('click', async () => {
    $('wakeBtn').hidden = true; awake = true;
    const hi = ch.hi;
    addMsg('bot', hi);
    const finished = await speak(hi);
    if (active && finished && $('live').checked) listen();
  });
  $('picker').addEventListener('click', (e) => {
    const b = e.target.closest('.char-btn');
    if (b && b.dataset.id !== ch.id) setCharacter(b.dataset.id);
  });
  setCharacter(loadChar());

  return () => {
    active = false;
    stopListening();
    stopSpeaking();
    unsubReact?.();
    getTracker().stop();
    stopCamera($('pipVideo'));
  };
}
