import { h, s } from './dom.ts';

/** Icons on a 24 px grid, drawn in the ink colour like the rest of the print: stroked, except the filled marks below. */
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
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
  /** GitHub's mark from Octicons (mark-github-24, MIT licence). */
  github: 'M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-2.764.509-3.479-.674-3.699-1.292-.124-.317-.66-1.293-1.127-1.554-.385-.207-.936-.715-.014-.729.866-.014 1.485.797 1.691 1.128.99 1.663 2.571 1.196 3.204.907.096-.715.385-1.196.701-1.471-2.448-.275-5.005-1.224-5.005-5.432 0-1.196.426-2.186 1.128-2.956-.111-.275-.496-1.402.11-2.915 0 0 .921-.288 3.024 1.128a10.193 10.193 0 0 1 2.75-.371c.936 0 1.871.123 2.75.371 2.104-1.43 3.025-1.128 3.025-1.128.605 1.513.221 2.64.111 2.915.701.77 1.127 1.747 1.127 2.956 0 4.222-2.571 5.157-5.019 5.432.399.344.743 1.004.743 2.035 0 1.471-.014 2.654-.014 3.025 0 .289.206.632.756.522C19.851 20.979 23 16.854 23 12c0-6.077-4.922-11-11-11Z',
} as const;

export type IconName = keyof typeof PATHS;

const FILLED_ICONS: ReadonlySet<IconName> = new Set<IconName>(['github']);

export function icon(name: IconName): SVGSVGElement {
  return s('svg', { class: FILLED_ICONS.has(name) ? 'icon icon-filled' : 'icon', viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' }, s('path', { d: PATHS[name] }));
}

/** An icon-only button; the label is its accessible name and its tooltip. */
export function iconButton(name: IconName, label: string): HTMLButtonElement {
  return h('button', { type: 'button', class: 'icon-button', 'aria-label': label, title: label }, icon(name));
}
