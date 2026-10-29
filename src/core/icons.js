// icons.js — inline SVG icons (stroke = currentColor) that replace the emojis on buttons.
// Usage: icon('mic') returns an <svg> string; icon('mic', 20) sets the size in px.

const P = {
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.3-.9-5.9-2.6L3.4 16a2 2 0 0 1 3.2-2.4L8 15"/>',
  expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  volumeOn: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  volumeOff: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
  laugh: '<circle cx="12" cy="12" r="10"/><path d="M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5z" fill="currentColor"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.4 1-3 0 1.4 1 2.5 2.5 2.5z"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  robot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><path d="M9 14h.01"/><path d="M15 14h.01"/><path d="M9.5 17.5h5"/>',
  flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10.5 8 10.5 4.5 12 3c1.5 1.5 1.5 5 0 6.5z"/><path d="M12 14.5c1.5 1.5 1.5 5 0 6.5-1.5-1.5-1.5-5 0-6.5z"/><path d="M9.5 12C8 13.5 4.5 13.5 3 12c1.5-1.5 5-1.5 6.5 0z"/><path d="M14.5 12c1.5-1.5 5-1.5 6.5 0-1.5 1.5-5 1.5-6.5 0z"/>',
  cat: '<path d="M4 20V6l4 3a9 9 0 0 1 8 0l4-3v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" stroke-linejoin="round"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M11 17h2"/>',
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.3 3 5.500V20h10v-3.500c1.7-1.2 3-2.9 3-5.500a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.5" r="1.5"/><circle cx="15" cy="11.5" r="1.5"/><path d="M10 20v-2"/><path d="M14 20v-2"/>',
};

/** Returns an inline <svg> string for the named icon. */
export function icon(name, size = 20) {
  const body = P[name] || '';
  return `<svg class="ico" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Icon + label, for buttons that show both. */
export const iconLabel = (name, label, size = 18) => `${icon(name, size)}<span>${label}</span>`;

/** Mute toggle content (used by Game and Strike). */
export const muteHtml = (muted) => (muted ? iconLabel('volumeOff', 'Sound off') : iconLabel('volumeOn', 'Sound on'));

/** Character id → icon name (replaces the emoji in the Zippy picker). */
export const CHAR_ICON = { zippy: 'robot', sakura: 'flower', luna: 'cat', captain: 'skull' };
