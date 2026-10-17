import { slugify } from '../../src/data/ids.ts';
import type { DraftShow, Geo, GeoPrecision } from '../../src/data/types.ts';

export const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
/** Nominatim's usage policy allows at most one request per second; keep a margin. */
export const MIN_REQUEST_INTERVAL_MS = 1100;
const COORDINATE_DECIMALS = 5;

export type CacheEntry =
  | { readonly lat: number; readonly lon: number; readonly precision: GeoPrecision; readonly retrievedAt: string }
  | { readonly miss: true; readonly retrievedAt: string };

export interface GeoCache {
  readonly version: 1;
  readonly entries: Record<string, CacheEntry>;
}

export interface GeocoderDependencies {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly userAgent: string;
  readonly today: string;
  readonly retryMisses: boolean;
}

export interface Lookup {
  readonly geo: Geo | null;
  readonly fromCache: boolean;
}

interface NominatimResult {
  readonly lat: string;
  readonly lon: string;
  readonly category?: string;
  readonly class?: string;
  readonly address?: { readonly country_code?: string };
}

/** Result categories that describe a settlement or boundary rather than the venue itself. */
const AREA_CATEGORIES = new Set(['place', 'boundary']);

export class GeocodeError extends Error {}

export function emptyCache(): GeoCache {
  return { version: 1, entries: {} };
}

export function parseCache(text: string): GeoCache {
  const json: unknown = JSON.parse(text);
  if (typeof json !== 'object' || json === null || !('version' in json) || json.version !== 1 || !('entries' in json)) {
    throw new GeocodeError('tools/geocache.json is not a version 1 cache');
  }
  const entries = json.entries;
  if (typeof entries !== 'object' || entries === null) throw new GeocodeError('tools/geocache.json has no entries object');
  const checked: Record<string, CacheEntry> = {};
  for (const [key, value] of Object.entries(entries)) checked[key] = parseCacheEntry(key, value);
  return { version: 1, entries: checked };
}

function parseCacheEntry(key: string, value: unknown): CacheEntry {
  const invalid = () => new GeocodeError(`tools/geocache.json entry "${key}" is malformed; delete it to query again`);
  if (typeof value !== 'object' || value === null || !('retrievedAt' in value) || typeof value.retrievedAt !== 'string') throw invalid();
  if ('miss' in value) {
    if (value.miss !== true) throw invalid();
    return { miss: true, retrievedAt: value.retrievedAt };
  }
  if (!('lat' in value) || !('lon' in value) || !('precision' in value)) throw invalid();
  const { lat, lon, precision } = value;
  if (typeof lat !== 'number' || typeof lon !== 'number' || (precision !== 'venue' && precision !== 'city')) throw invalid();
  return { lat, lon, precision, retrievedAt: value.retrievedAt };
}

export function serializeCache(cache: GeoCache): string {
  const sorted = Object.fromEntries(Object.entries(cache.entries).toSorted(([a], [b]) => (a < b ? -1 : 1)));
  return `${JSON.stringify({ version: 1, entries: sorted }, null, 2)}\n`;
}

/** Looks up venue (or event) + city first, then the city alone. Results and misses are cached. */
export function createGeocoder(cache: GeoCache, deps: GeocoderDependencies) {
  let lastRequestAt = Number.NEGATIVE_INFINITY;

  async function request(params: Record<string, string>): Promise<NominatimResult | null> {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - deps.now();
    if (wait > 0) await deps.sleep(wait);
    lastRequestAt = deps.now();
    const url = new URL(NOMINATIM_ENDPOINT);
    for (const [key, value] of Object.entries({ format: 'jsonv2', addressdetails: '1', limit: '1', ...params })) {
      url.searchParams.set(key, value);
    }
    const response = await deps.fetch(url, { headers: { 'User-Agent': deps.userAgent, Accept: 'application/json' } });
    if (!response.ok) {
      throw new GeocodeError(`Nominatim answered ${response.status} ${response.statusText}; stopping so the usage policy is respected`);
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new GeocodeError('Nominatim returned an unexpected response');
    const [first] = body as NominatimResult[];
    return first ?? null;
  }

  async function cached(key: string, query: () => Promise<{ lat: number; lon: number; precision: GeoPrecision } | null>): Promise<Lookup> {
    const entry = cache.entries[key];
    if (entry !== undefined && !('miss' in entry)) return { geo: toGeo(entry), fromCache: true };
    if (entry !== undefined && !deps.retryMisses) return { geo: null, fromCache: true };
    const found = await query();
    cache.entries[key] = found === null ? { miss: true, retrievedAt: deps.today } : { ...found, retrievedAt: deps.today };
    return { geo: found === null ? null : toGeo(found), fromCache: false };
  }

  const accept = (result: NominatimResult | null, countryCode: string, precision: GeoPrecision) => {
    if (result === null || result.address?.country_code?.toUpperCase() !== countryCode) return null;
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const category = result.category ?? result.class ?? '';
    const actualPrecision: GeoPrecision = precision === 'venue' && AREA_CATEGORIES.has(category) ? 'city' : precision;
    return { lat: round(lat), lon: round(lon), precision: actualPrecision };
  };

  return async function geocode(show: DraftShow): Promise<Lookup> {
    const place = [show.city, show.region].filter((part) => part !== null).join(', ');
    const placeKey = `${show.countryCode}|${slugify(show.city)}|${slugify(show.region ?? '')}`;
    const venueName = show.venue ?? show.eventName;

    if (venueName !== null) {
      const venue = await cached(`venue|${placeKey}|${slugify(venueName)}`, async () =>
        accept(await request({ q: `${venueName}, ${place}`, countrycodes: show.countryCode.toLowerCase() }), show.countryCode, 'venue'),
      );
      if (venue.geo !== null) return venue;
    }

    return cached(`city|${placeKey}`, async () => {
      const params: Record<string, string> = { city: show.city, countrycodes: show.countryCode.toLowerCase() };
      if (show.region !== null) params['state'] = show.region;
      return accept(await request(params), show.countryCode, 'city');
    });
  };
}

function toGeo(entry: { readonly lat: number; readonly lon: number; readonly precision: GeoPrecision }): Geo {
  return { lat: entry.lat, lon: entry.lon, precision: entry.precision, source: 'nominatim' };
}

function round(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}
