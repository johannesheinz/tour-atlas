import { DEFAULT_STYLE, type Style } from '../data/styles.ts';
import type { ThemeMode, ThemePreference } from '../model.ts';

export type { ThemeMode, ThemePreference } from '../model.ts';

/** The active style's tokens that canvas drawing and SVG attributes need as concrete values. */
export interface ThemeTokens {
  readonly mode: ThemeMode;
  readonly stock: string;
  readonly ink: string;
  readonly inkSoft: string;
  readonly inkMuted: string;
  readonly past: string;
  /** Canvas font shorthands for the timeline's lane labels. */
  readonly laneFont: string;
  readonly compactLaneFont: string;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'auto') delete root.dataset['theme'];
  else root.dataset['theme'] = preference;
}

/** Stage lights, the default, is the stylesheet's :root; the others select their tokens by data-style. */
export function applyStyle(style: Style): void {
  const root = document.documentElement;
  if (style === DEFAULT_STYLE) delete root.dataset['style'];
  else root.dataset['style'] = style;
}

export function resolveThemeMode(preference: ThemePreference): ThemeMode {
  if (preference !== 'auto') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Canvas and SVG attributes need concrete values; read them from the CSS custom properties. */
export function readThemeTokens(preference: ThemePreference): ThemeTokens {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => {
    const value = style.getPropertyValue(name).trim();
    if (value === '') throw new Error(`CSS custom property ${name} is not defined`);
    return value;
  };
  return {
    mode: resolveThemeMode(preference),
    stock: token('--stock'),
    ink: token('--ink'),
    inkSoft: token('--ink-soft'),
    inkMuted: token('--ink-muted'),
    past: token('--past'),
    laneFont: token('--lane-font'),
    compactLaneFont: token('--lane-font-compact'),
  };
}

export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
