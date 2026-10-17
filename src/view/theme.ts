import type { BandEntry } from '../model.ts';

export type ThemePreference = 'auto' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  readonly mode: ThemeMode;
  readonly stock: string;
  readonly ink: string;
  readonly inkSoft: string;
  readonly inkMuted: string;
  readonly past: string;
  readonly border: string;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'auto') delete root.dataset['theme'];
  else root.dataset['theme'] = preference;
}

export function resolveThemeMode(preference: ThemePreference): ThemeMode {
  if (preference !== 'auto') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Canvas and SVG attributes need concrete colours; read them from the CSS custom properties. */
export function readThemeColors(preference: ThemePreference): ThemeColors {
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
    border: token('--border-line'),
  };
}

export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function bandColor(band: BandEntry, mode: ThemeMode): string {
  return band.color[mode];
}
