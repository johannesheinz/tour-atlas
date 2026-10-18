import { assignShowIds } from './ids.ts';
import { sortTags } from './tags.ts';
import type { BandFileOf, DraftBandFile, DraftShow, Geo, IdentifiedBandFile, IdentifiedShow } from './types.ts';

/**
 * Canonical form of a validated file: trimmed text, generated ids for shows without one,
 * shows sorted by date then id. Key order is fixed by construction and matches the schema.
 */
export function normalizeBandFile(file: DraftBandFile): IdentifiedBandFile {
  const shows = identifyShows(file).toSorted(compareShows).map(orderShowKeys);
  return {
    schemaVersion: file.schemaVersion,
    band: { id: file.band.id, name: file.band.name.trim(), color: file.band.color, tags: sortTags(file.band.tags), logoUrl: file.band.logoUrl },
    source: { url: file.source.url, retrievedAt: file.source.retrievedAt },
    shows,
  };
}

/** The shows trimmed and given ids, still in the file's order. */
export function identifyShows(file: DraftBandFile): IdentifiedShow[] {
  return assignShowIds(file.band.id, file.shows.map(trimShow));
}

export function serializeBandFile(file: BandFileOf<IdentifiedShow | DraftShow>): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function compareShows(a: IdentifiedShow, b: IdentifiedShow): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function trimShow(show: DraftShow): DraftShow {
  return {
    ...show,
    tourName: trimOrNull(show.tourName),
    eventName: trimOrNull(show.eventName),
    venue: trimOrNull(show.venue),
    city: show.city.trim(),
    region: trimOrNull(show.region),
    notes: trimOrNull(show.notes),
  };
}

function trimOrNull(text: string | null): string | null {
  return text === null ? null : text.trim();
}

function orderShowKeys(show: IdentifiedShow): IdentifiedShow {
  return {
    id: show.id,
    date: show.date,
    endDate: show.endDate,
    startTime: show.startTime,
    tourName: show.tourName,
    eventName: show.eventName,
    venue: show.venue,
    city: show.city,
    region: show.region,
    countryCode: show.countryCode,
    status: show.status,
    ticketUrl: show.ticketUrl,
    sourceUrl: show.sourceUrl,
    notes: show.notes,
    geo: show.geo === null ? null : orderGeoKeys(show.geo),
  };
}

function orderGeoKeys(geo: Geo): Geo {
  return { lat: geo.lat, lon: geo.lon, precision: geo.precision, source: geo.source };
}
