import { DAY_MS } from './timeScale.ts';

export type TimePreset = 'upcoming' | 'next-3-months' | 'past' | 'all';

export const TIME_PRESETS: readonly { readonly id: TimePreset; readonly label: string; readonly title: string }[] = [
  { id: 'upcoming', label: 'Upcoming', title: 'From today to the last announced show' },
  { id: 'next-3-months', label: 'Next 3 months', title: 'From today to three months ahead' },
  { id: 'past', label: 'Past', title: 'From the first show to today' },
  { id: 'all', label: 'All dates', title: 'Fit the timeline to every show' },
];

export const PRESET_IDS: readonly TimePreset[] = TIME_PRESETS.map((preset) => preset.id);

const LEAD_DAYS = 3;
const NEXT_MONTHS_DAYS = 92;
const TRAILING_PADDING = 0.03;
const MIN_SPAN_DAYS = 14;

interface Dated {
  readonly start: number;
  readonly end: number;
}

/** The window a preset shows; null means "fit everything". Throws for presets with no shows to show. */
export function presetRange(preset: TimePreset, shows: readonly Dated[], today: number): readonly [number, number] | null {
  if (!isPresetAvailable(preset, shows, today)) throw new RangeError(`preset ${preset} has no shows to show`);
  const lead = today - LEAD_DAYS * DAY_MS;
  switch (preset) {
    case 'all':
      return null;
    case 'next-3-months':
      return [lead, today + NEXT_MONTHS_DAYS * DAY_MS];
    case 'upcoming': {
      const last = Math.max(...shows.filter((show) => show.end >= today).map((show) => show.end)) + DAY_MS;
      const end = last + (last - lead) * TRAILING_PADDING;
      return [lead, Math.max(end, lead + MIN_SPAN_DAYS * DAY_MS)];
    }
    case 'past': {
      const first = Math.min(...shows.filter((show) => show.end < today).map((show) => show.start));
      const end = today + LEAD_DAYS * DAY_MS;
      const start = first - (end - first) * TRAILING_PADDING;
      return [Math.min(start, end - MIN_SPAN_DAYS * DAY_MS), end];
    }
  }
}

export function isPresetAvailable(preset: TimePreset, shows: readonly Dated[], today: number): boolean {
  switch (preset) {
    case 'all':
      return shows.length > 0;
    case 'upcoming':
      return shows.some((show) => show.end >= today);
    case 'next-3-months':
      return shows.some((show) => show.end >= today && show.start <= today + NEXT_MONTHS_DAYS * DAY_MS);
    case 'past':
      return shows.some((show) => show.end < today);
  }
}

/** Upcoming shows first; a dataset of history only opens on everything. */
export function defaultPreset(shows: readonly Dated[], today: number): TimePreset {
  return isPresetAvailable('upcoming', shows, today) ? 'upcoming' : 'all';
}
