import { parseIsoDate } from './data/dates.ts';
import { assignBandColors, extendBandColors, type BandColor } from './data/palette.ts';
import type { BandFile, Show } from './data/types.ts';

export interface BandEntry {
  readonly file: BandFile;
  readonly color: BandColor;
  readonly isPreview: boolean;
}

export interface ShowRef {
  readonly show: Show;
  readonly band: BandEntry;
  /** UTC midnight of date / endDate in ms, for scales. */
  readonly start: number;
  readonly end: number;
  readonly isPast: boolean;
}

/** A band's row on the timeline. */
export interface TimelineLane {
  readonly band: BandEntry;
  /** Sorted by start. */
  readonly shows: readonly ShowRef[];
}

export type BandSort = 'name' | 'next-show' | 'show-count';
export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'auto' | 'light' | 'dark';

export function bandColor(band: BandEntry, mode: ThemeMode): string {
  return band.color[mode];
}

/** Bundled bands overlaid with previews (same id replaces). Published bands keep their colours when previews arrive. */
export function buildBandEntries(bundled: readonly BandFile[], previews: readonly BandFile[]): BandEntry[] {
  const previewIds = new Set(previews.map((file) => file.band.id));
  const files = [...bundled.filter((file) => !previewIds.has(file.band.id)), ...previews];
  const publishedColors = assignBandColors(bundled.map((file) => file.band));
  const colors = extendBandColors(publishedColors, previews.map((file) => file.band));
  return files.map((file) => {
    const color = colors.get(file.band.id);
    if (color === undefined) throw new Error(`no colour assigned to ${file.band.id}`);
    return { file, color, isPreview: previewIds.has(file.band.id) };
  });
}

export function showRefs(band: BandEntry, today: string): ShowRef[] {
  return band.file.shows.map((show) => ({
    show,
    band,
    start: parseIsoDate(show.date).getTime(),
    end: parseIsoDate(show.endDate ?? show.date).getTime(),
    isPast: (show.endDate ?? show.date) < today,
  }));
}

export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

export function byBandName(a: BandEntry, b: BandEntry): number {
  return a.file.band.name.localeCompare(b.file.band.name);
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

/**
 * A show is in a range when the middle of one of its days is: the timeline draws dots there, so the
 * lists count exactly what is visible, and a range starting at midnight cannot catch the day before.
 */
export function isInRange(ref: ShowRef, range: TimeRange): boolean {
  return ref.end + HALF_DAY_MS >= range.start && ref.start + HALF_DAY_MS <= range.end;
}

/** The shows in the range; all shows without a range. */
export function showsInRange(refs: readonly ShowRef[], range: TimeRange | null): readonly ShowRef[] {
  return range === null ? refs : refs.filter((ref) => isInRange(ref, range));
}

/** Sorts by what happens in the time range: most shows in it, or the earliest upcoming show in it. */
export function sortBands(bands: readonly BandEntry[], sort: BandSort, inRange: (band: BandEntry) => readonly ShowRef[]): BandEntry[] {
  switch (sort) {
    case 'name':
      return bands.toSorted(byBandName);
    case 'show-count':
      return bands.toSorted((a, b) => inRange(b).length - inRange(a).length || byBandName(a, b));
    case 'next-show': {
      const next = (band: BandEntry) => Math.min(...inRange(band).filter((ref) => !ref.isPast).map((ref) => ref.start));
      return bands.toSorted((a, b) => {
        const nextA = next(a);
        const nextB = next(b);
        if (nextA === nextB) return byBandName(a, b);
        return nextA < nextB ? -1 : 1;
      });
    }
  }
}

export function dateRange(refs: readonly ShowRef[]): { readonly first: string; readonly last: string } | null {
  const [first] = refs;
  if (first === undefined) return null;
  const firstDate = refs.reduce((earliest, ref) => (ref.show.date < earliest ? ref.show.date : earliest), first.show.date);
  const lastDate = refs.reduce((latest, ref) => {
    const end = ref.show.endDate ?? ref.show.date;
    return end > latest ? end : latest;
  }, first.show.endDate ?? first.show.date);
  return { first: firstDate, last: lastDate };
}
