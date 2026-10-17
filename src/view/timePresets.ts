import { DAY_MS } from './timeScale.ts';

export type TimePreset = 'next-3-months' | 'next-6-months' | 'next-12-months' | 'upcoming' | 'past' | 'all';

export const TIME_PRESETS: readonly { readonly id: TimePreset; readonly label: string; readonly title: string }[] = [
  { id: 'next-3-months', label: 'Next 3 months', title: 'From today to three months ahead' },
  { id: 'next-6-months', label: 'Next 6 months', title: 'From today to six months ahead' },
  { id: 'next-12-months', label: 'Next 12 months', title: 'From today to a year ahead' },
  { id: 'upcoming', label: 'All upcoming', title: 'From today to the last announced show' },
  { id: 'past', label: 'Past', title: 'From the first show to today' },
  { id: 'all', label: 'All dates', title: 'Fit the timeline to every show' },
];

export const PRESET_IDS: readonly TimePreset[] = TIME_PRESETS.map((preset) => preset.id);

const MONTHS_AHEAD_DAYS: Partial<Record<TimePreset, number>> = { 'next-3-months': 92, 'next-6-months': 183, 'next-12-months': 365 };
const DEFAULT_LEAD_DAYS = 3;
const PAST_MONTH_LEAD_DAYS = 31;
const TRAILING_PADDING = 0.03;
const MIN_SPAN_DAYS = 14;

interface Dated {
  readonly start: number;
  readonly end: number;
}

/** Forward-looking presets: "include last month" pulls their start back so a running tour stays in view. */
export function usesPastMonth(preset: TimePreset): boolean {
  return preset !== 'past' && preset !== 'all';
}

function windowStart(today: number, includePastMonth: boolean): number {
  return today - (includePastMonth ? PAST_MONTH_LEAD_DAYS : DEFAULT_LEAD_DAYS) * DAY_MS;
}

/** The window a preset shows; null means "fit everything". Throws for presets with no shows to show. */
export function presetRange(preset: TimePreset, shows: readonly Dated[], today: number, includePastMonth: boolean): readonly [number, number] | null {
  if (!isPresetAvailable(preset, shows, today, includePastMonth)) throw new RangeError(`preset ${preset} has no shows to show`);
  const start = windowStart(today, includePastMonth);
  const daysAhead = MONTHS_AHEAD_DAYS[preset];
  if (daysAhead !== undefined) return [start, today + daysAhead * DAY_MS];
  switch (preset) {
    case 'all':
      return null;
    case 'upcoming': {
      const last = Math.max(...shows.filter((show) => show.end >= start).map((show) => show.end)) + DAY_MS;
      const end = last + (last - start) * TRAILING_PADDING;
      return [start, Math.max(end, start + MIN_SPAN_DAYS * DAY_MS)];
    }
    case 'past': {
      const first = Math.min(...shows.filter((show) => show.end < today).map((show) => show.start));
      const end = today + DEFAULT_LEAD_DAYS * DAY_MS;
      const paddedStart = first - (end - first) * TRAILING_PADDING;
      return [Math.min(paddedStart, end - MIN_SPAN_DAYS * DAY_MS), end];
    }
    default:
      throw new RangeError(`preset ${preset} has no range rule`);
  }
}

export function isPresetAvailable(preset: TimePreset, shows: readonly Dated[], today: number, includePastMonth: boolean): boolean {
  const start = windowStart(today, includePastMonth);
  const daysAhead = MONTHS_AHEAD_DAYS[preset];
  if (daysAhead !== undefined) return shows.some((show) => show.end >= start && show.start <= today + daysAhead * DAY_MS);
  switch (preset) {
    case 'all':
      return shows.length > 0;
    case 'upcoming':
      return shows.some((show) => show.end >= start);
    case 'past':
      return shows.some((show) => show.end < today);
    default:
      throw new RangeError(`preset ${preset} has no availability rule`);
  }
}

/** All upcoming shows first; a dataset of history only opens on everything. */
/** The next six months when anything is on then; otherwise everything upcoming; otherwise all dates. */
export function defaultPreset(shows: readonly Dated[], today: number): TimePreset {
  if (isPresetAvailable('next-6-months', shows, today, false)) return 'next-6-months';
  return isPresetAvailable('upcoming', shows, today, false) ? 'upcoming' : 'all';
}
