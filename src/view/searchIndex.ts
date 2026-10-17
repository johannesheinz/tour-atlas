import { slugify } from '../data/ids.ts';
import type { BandEntry } from '../model.ts';

export type SearchKind = 'band' | 'place' | 'venue' | 'tour' | 'event';

export interface SearchEntry {
  readonly kind: SearchKind;
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly bandIds: readonly string[];
  readonly showIds: readonly string[];
  readonly folded: string;
}

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  band: 'Bands',
  place: 'Cities',
  venue: 'Venues',
  tour: 'Tours',
  event: 'Festivals and events',
};

const KIND_ORDER: readonly SearchKind[] = ['band', 'place', 'tour', 'event', 'venue'];

/** Lowercase, accents removed, so "sao" finds "São Paulo". */
export function foldForSearch(text: string): string {
  return slugify(text).replaceAll('-', ' ');
}

interface Accumulator {
  label: string;
  detail: (bandCount: number, showCount: number) => string;
  bandIds: Set<string>;
  showIds: string[];
}

export function buildSearchIndex(bands: readonly BandEntry[], countryName: (code: string) => string): SearchEntry[] {
  const groups = new Map<string, Accumulator & { kind: SearchKind }>();
  const add = (kind: SearchKind, key: string, label: string, detail: Accumulator['detail'], bandId: string, showId: string | null) => {
    const groupKey = `${kind}:${key}`;
    let group = groups.get(groupKey);
    if (group === undefined) {
      group = { kind, label, detail, bandIds: new Set(), showIds: [] };
      groups.set(groupKey, group);
    }
    group.bandIds.add(bandId);
    if (showId !== null) group.showIds.push(showId);
  };
  const shows = (bandCount: number, showCount: number) =>
    `${showCount} ${showCount === 1 ? 'show' : 'shows'}${bandCount > 1 ? `, ${bandCount} bands` : ''}`;

  for (const band of bands) {
    const bandId = band.file.band.id;
    add('band', bandId, band.file.band.name, (_bands, count) => shows(1, count), bandId, null);
    for (const show of band.file.shows) {
      add('band', bandId, band.file.band.name, (_bands, count) => shows(1, count), bandId, show.id);
      const place = `${show.city}, ${countryName(show.countryCode)}`;
      add('place', `${slugify(show.city)}|${show.countryCode}`, place, shows, bandId, show.id);
      if (show.venue !== null) {
        add('venue', `${slugify(show.venue)}|${slugify(show.city)}|${show.countryCode}`, show.venue, () => place, bandId, show.id);
      }
      if (show.tourName !== null) {
        const bandName = band.file.band.name;
        add('tour', `${bandId}|${show.tourName}`, show.tourName, (_bands, count) => `${bandName}, ${shows(1, count)}`, bandId, show.id);
      }
      if (show.eventName !== null) {
        add('event', `${slugify(show.eventName)}|${show.city}`, show.eventName, () => place, bandId, show.id);
      }
    }
  }

  return [...groups.entries()].map(([key, group]) => ({
    kind: group.kind,
    key,
    label: group.label,
    detail: group.detail(group.bandIds.size, group.showIds.length),
    bandIds: [...group.bandIds],
    showIds: group.showIds,
    folded: foldForSearch(group.label),
  }));
}

/** Prefix matches rank above word matches, which rank above substring matches; then by size. */
export function searchEntries(index: readonly SearchEntry[], query: string, limitPerKind: number): SearchEntry[] {
  const folded = foldForSearch(query);
  if (folded === '') return [];
  const scored = index.flatMap((entry) => {
    const position = entry.folded.indexOf(folded);
    if (position === -1) return [];
    const rank = position === 0 ? 0 : entry.folded[position - 1] === ' ' ? 1 : 2;
    return [{ entry, rank }];
  });
  return KIND_ORDER.flatMap((kind) =>
    scored
      .filter(({ entry }) => entry.kind === kind)
      .toSorted((a, b) => a.rank - b.rank || b.entry.showIds.length - a.entry.showIds.length || a.entry.label.localeCompare(b.entry.label))
      .slice(0, limitPerKind)
      .map(({ entry }) => entry),
  );
}
