// characters.js — the talking buddies: look (SVG), personality, voice settings, offline flavor.
// All characters are original and kept wholesome and friendly.

const ZIPPY = `<svg viewBox="0 0 200 200" role="img" aria-hidden="true">
  <line x1="100" y1="24" x2="100" y2="44" class="stem"/><circle class="ant" cx="100" cy="16" r="9"/>
  <rect class="head" x="30" y="44" width="140" height="120" rx="34"/><rect class="visor" x="42" y="66" width="116" height="62" rx="22"/>
  <ellipse class="eye glow" cx="76" cy="96" rx="10" ry="12"/><ellipse class="eye glow" cx="124" cy="96" rx="10" ry="12"/>
  <ellipse class="mouth robot" cx="100" cy="146" rx="18" ry="4"/>
</svg>`;

/** Anime-style face builder: big shiny eyes, blush, bangs. */
function anime({ hair, shade, iris, behind = '', front = '' }) {
  const eye = (x) => `<g transform="translate(${x} 114)"><g class="eye">
    <ellipse rx="13" ry="16" fill="#fff"/><ellipse cy="1" rx="10" ry="14" fill="${iris}"/><ellipse cy="2" rx="5" ry="8" fill="#1b0f3a"/>
    <circle cx="-4" cy="-6" r="4" fill="#fff"/><circle cx="4" cy="6" r="2" fill="#fff"/>
    <path d="M-14 -8 Q0 -22 14 -8" fill="none" stroke="#2a1840" stroke-width="3" stroke-linecap="round"/></g></g>`;
  return `<svg viewBox="0 0 200 200" role="img" aria-hidden="true">${behind}
  <path d="M28 112 C18 40 68 8 100 8 C132 8 182 40 172 112 L178 190 C152 184 150 150 150 122 L50 122 C50 150 48 184 22 190 Z" fill="${hair}"/>
  <ellipse cx="100" cy="106" rx="52" ry="58" fill="#ffe4d6"/>
  <path d="M46 100 C50 42 100 34 100 34 C100 34 150 42 154 100 C140 74 124 62 104 66 C112 80 98 92 78 92 C66 92 54 94 46 100 Z" fill="${hair}"/>
  <path d="M70 52 C80 46 92 44 100 44" fill="none" stroke="${shade}" stroke-width="3" opacity=".5" stroke-linecap="round"/>
  ${eye(76)}${eye(124)}
  <ellipse cx="58" cy="136" rx="9" ry="5" fill="#ff7aa8" opacity=".55"/><ellipse cx="142" cy="136" rx="9" ry="5" fill="#ff7aa8" opacity=".55"/>
  <ellipse class="mouth anime" cx="100" cy="146" rx="7" ry="3" fill="#e2476f"/>${front}</svg>`;
}

const SAKURA = anime({
  hair: '#ff8fc7', shade: '#ffd0ea', iris: '#8a5cff',
  front: '<g fill="#ff4f86"><path d="M52 46 L28 34 L30 62 Z"/><path d="M52 46 L76 34 L74 62 Z"/><circle cx="52" cy="47" r="6" fill="#ff1f6b"/></g>',
});

const LUNA = anime({
  hair: '#3b2a7a', shade: '#9a86ff', iris: '#ffc83d',
  behind: '<path d="M44 56 L36 6 L86 30 Z" fill="#3b2a7a"/><path d="M50 46 L45 20 L74 33 Z" fill="#ff9fc0"/><path d="M156 56 L164 6 L114 30 Z" fill="#3b2a7a"/><path d="M150 46 L155 20 L126 33 Z" fill="#ff9fc0"/>',
  front: '<path d="M95 150 L98 158 L101 150 Z" fill="#fff"/>',
});

const CAPTAIN = `<svg viewBox="0 0 200 200" role="img" aria-hidden="true">
  <ellipse cx="100" cy="112" rx="56" ry="58" fill="#f0c49c"/>
  <path d="M42 86 C60 28 140 28 158 86 C130 70 70 70 42 86Z" fill="#d62f3d"/><path d="M150 72 L186 90 L162 98 L174 122 L146 96Z" fill="#d62f3d"/>
  <path d="M46 92 L132 106" stroke="#1d1d1d" stroke-width="3"/><ellipse cx="74" cy="106" rx="15" ry="13" fill="#1d1d1d"/>
  <g transform="translate(128 108)"><g class="eye"><circle r="11" fill="#fff"/><circle r="5.5" fill="#2b1b10"/><circle cx="-2" cy="-2" r="2" fill="#fff"/></g></g>
  <path d="M64 140 C80 128 96 136 100 142 C104 136 120 128 136 140 C122 150 106 146 100 146 C94 146 78 150 64 140Z" fill="#6b3a1c"/>
  <ellipse class="mouth" cx="100" cy="158" rx="14" ry="4" fill="#5a1a1a"/><circle cx="46" cy="126" r="5" fill="none" stroke="#ffc83d" stroke-width="3"/>
</svg>`;

export const CHARACTERS = {
  zippy: {
    id: 'zippy', name: 'Zippy', emoji: '🤖', svg: ZIPPY, pitch: 1.25, rate: 1.05, voice: 'any',
    persona: 'You are Zippy, a cheerful, witty robot buddy living inside a webcam gesture app. You chat like a friendly assistant who loves jokes, puns and playful teasing.',
    hi: 'Hey there! I am Zippy, your talking robot buddy. Ask me anything, or say tell me a joke!',
    flavor: (t) => t,
  },
  sakura: {
    id: 'sakura', name: 'Sakura', emoji: '🌸', svg: SAKURA, pitch: 1.5, rate: 1.1, voice: 'female',
    persona: 'You are Sakura, a sweet, bubbly anime-style girl and friendly companion in a webcam gesture app. You love cute puns, snacks and cheering people on. Add a little anime flavor now and then, like "sugoi" or "ne", but stay easy to understand. Keep it wholesome and friendly, never romantic or flirty.',
    hi: 'Konnichiwa! I am Sakura, your cheerful anime buddy. Want a joke, a fun fact, or just a friendly chat?',
    flavor: (t) => `${t} Hehe, did that make you smile?`,
  },
  luna: {
    id: 'luna', name: 'Luna', emoji: '🐱', svg: LUNA, pitch: 1.35, rate: 1.0, voice: 'female',
    persona: 'You are Luna, a sassy anime-style cat-girl and friendly companion in a webcam gesture app, with playful tsundere energy: you tease people and pretend not to care, but you are secretly kind and helpful. Sprinkle in cat puns. Keep it wholesome, never mean, never romantic or flirty.',
    hi: 'Hmph. I am Luna. Not that I was waiting for you or anything. So, what do you want to talk about?',
    flavor: (t) => `${t} Not that I wanted you to laugh or anything.`,
  },
  captain: {
    id: 'captain', name: 'Captain Pun', emoji: '🏴‍☠️', svg: CAPTAIN, pitch: 0.7, rate: 0.95, voice: 'male',
    persona: 'You are Captain Pun, a jolly pirate who answers helpfully but loves sea puns and dad jokes. Say "Arr" now and then.',
    hi: 'Ahoy, matey! Captain Pun at your service. Ask me anything, or I will tell a joke that shivers your timbers!',
    flavor: (t) => `Arr! ${t}`,
  },
};
export const CHAR_ORDER = ['zippy', 'sakura', 'luna', 'captain'];

const FEMALE = /female|woman|zira|samantha|susan|hazel|aria|jenny|karen|moira|tessa|victoria|fiona|heera|priya|neerja|swara|lekha|monica|paulina|amelie|ava|allison|nora/i;
const MALE = /\bmale\b|david|mark|daniel|alex|george|james|guy|ryan|fred|thomas|rishi|ravi|jorge|diego|henri/i;

/** Pick an installed voice in the chosen language, matching the character's gender if we can tell. */
export function pickVoice(voices, lang, pref) {
  const l = lang.slice(0, 2).toLowerCase();
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(l));
  if (!pool.length) return null;
  if (pref === 'female') return pool.find((v) => FEMALE.test(v.name)) || pool[0];
  if (pref === 'male') return pool.find((v) => MALE.test(v.name)) || pool[0];
  return pool[0];
}
