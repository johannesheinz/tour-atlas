import { h, s } from './dom.ts';

/** Stroke icons on a 24 px grid, drawn in the ink colour like the rest of the print. */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3.6 9h16.8M3.6 15h16.8M12 3c-2.4 2.6-3.6 5.6-3.6 9s1.2 6.4 3.6 9M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9',
  flat: 'M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12M12 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3',
  'chevron-left': 'M14.5 6l-6 6 6 6',
  'chevron-right': 'M9.5 6l6 6-6 6',
  'zoom-out': 'M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12M15 15l5 5M7.5 10.5h6',
  sliders: 'M4 7h9M17 7h3M15 5v4M4 12h3M11 12h9M9 10v4M4 17h11M19 17h1M17 15v4',
  gear: 'M10.26 5.01L10.50 2.52L13.50 2.52L13.74 5.01L15.71 5.83L17.64 4.23L19.77 6.36L18.17 8.29L18.99 10.26L21.48 10.50L21.48 13.50L18.99 13.74L18.17 15.71L19.77 17.64L17.64 19.77L15.71 18.17L13.74 18.99L13.50 21.48L10.50 21.48L10.26 18.99L8.29 18.17L6.36 19.77L4.23 17.64L5.83 15.71L5.01 13.74L2.52 13.50L2.52 10.50L5.01 10.26L5.83 8.29L4.23 6.36L6.36 4.23L8.29 5.83ZM12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6M12 7.5v.5',
  play: 'M8 5.5v13l10.5-6.5z',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): SVGSVGElement {
  return s('svg', { class: 'icon', viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' }, s('path', { d: PATHS[name] }));
}

/** An icon-only button; the label is its accessible name and its tooltip. */
export function iconButton(name: IconName, label: string): HTMLButtonElement {
  return h('button', { type: 'button', class: 'icon-button', 'aria-label': label, title: label }, icon(name));
}
