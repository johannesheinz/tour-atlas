import { DAY_MS } from './timeScale.ts';

export type TimePreset = 'next-3-months' | 'next-6-months' | 'next-12-months' | 'upcoming' | 'past' | 'all';

/** In the order the controls offer them; their names live in the message catalogs. */
export const PRESET_IDS: readonly TimePreset[] = ['next-3-months', 'next-6-months', 'next-12-months', 'upcoming', 'past', 'all'];

const MONTHS_AHEAD_DAYS: Partial<Record<TimePreset, number>> = { 'next-3-months': 92, 'next-6-months': 183, 'next-12-months': 365 };
const PAST_MONTH_LEAD_DAYS = 31;
const PAST_TRAILING_DAYS = 3;
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

/** Forward-looking ranges start today; the timeline's gutter keeps today clear of the band names. */
function windowStart(today: number, includePastMonth: boolean): number {
  return includePastMonth ? today - PAST_MONTH_LEAD_DAYS * DAY_MS : today;
}

/**
 * The window a preset shows; null means "fit everything". Shows only shape the open-ended presets; without any,
 * "upcoming" and "past" show a short range next to today, so a preset can be applied to an empty area.
 */
export function presetWindow(preset: TimePreset, shows: readonly Dated[], today: number, includePastMonth: boolean): readonly [number, number] | null {
  const start = windowStart(today, includePastMonth);
  const daysAhead = MONTHS_AHEAD_DAYS[preset];
  if (daysAhead !== undefined) return [start, today + daysAhead * DAY_MS];
  switch (preset) {
    case 'all':
      return null;
    case 'upcoming': {
      const ends = shows.filter((show) => show.end >= start).map((show) => show.end);
      if (ends.length === 0) return [start, start + MIN_SPAN_DAYS * DAY_MS];
      const last = Math.max(...ends) + DAY_MS;
      const end = last + (last - start) * TRAILING_PADDING;
      return [start, Math.max(end, start + MIN_SPAN_DAYS * DAY_MS)];
    }
    case 'past': {
      const end = today + PAST_TRAILING_DAYS * DAY_MS;
      const starts = shows.filter((show) => show.end < today).map((show) => show.start);
      if (starts.length === 0) return [end - MIN_SPAN_DAYS * DAY_MS, end];
      const first = Math.min(...starts);
      const paddedStart = first - (end - first) * TRAILING_PADDING;
      return [Math.min(paddedStart, end - MIN_SPAN_DAYS * DAY_MS), end];
    }
    default:
      throw new RangeError(`preset ${preset} has no range rule`);
  }
}

/**
 * The window after the bands, genres or area change: a preset is worked out again for the shows now in scope,
 * a range of the user's own stays as it is. Every view then depends only on the filters and this choice, not on
 * the order they were made in.
 */
export function windowAfterFilterChange(
  preset: TimePreset | null,
  window: Dated | null,
  shows: readonly Dated[],
  today: number,
  includePastMonth: boolean,
): readonly [number, number] | null {
  if (preset !== null) return presetWindow(preset, shows, today, includePastMonth);
  if (window === null) throw new RangeError('a custom range needs a window to keep');
  return [window.start, window.end];
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
