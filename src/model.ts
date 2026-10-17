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

export function nextShowDate(band: BandEntry, today: string): string | null {
  return band.file.shows.find((show) => (show.endDate ?? show.date) >= today)?.date ?? null;
}

export function sortBands(bands: readonly BandEntry[], sort: BandSort, today: string): BandEntry[] {
  const byName = (a: BandEntry, b: BandEntry) => a.file.band.name.localeCompare(b.file.band.name);
  switch (sort) {
    case 'name':
      return bands.toSorted(byName);
    case 'show-count':
      return bands.toSorted((a, b) => b.file.shows.length - a.file.shows.length || byName(a, b));
    case 'next-show':
      return bands.toSorted((a, b) => {
        const nextA = nextShowDate(a, today);
        const nextB = nextShowDate(b, today);
        if (nextA === nextB) return byName(a, b);
        if (nextA === null) return 1;
        if (nextB === null) return -1;
        return nextA < nextB ? -1 : 1;
      });
  }
}

export function dateRange(band: BandEntry): { readonly first: string; readonly last: string } | null {
  const first = band.file.shows[0];
  if (first === undefined) return null;
  const last = band.file.shows.reduce((latest, show) => {
    const end = show.endDate ?? show.date;
    return end > latest ? end : latest;
  }, first.date);
  return { first: first.date, last };
}
