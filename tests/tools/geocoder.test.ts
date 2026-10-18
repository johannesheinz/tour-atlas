import { describe, expect, it, vi } from 'vitest';
import { MAX_VENUE_DISTANCE_KM, MIN_REQUEST_INTERVAL_MS, createGeocoder, emptyCache, parseCache, serializeCache, type GeoCache } from '../../tools/shared/geocoder.ts';
import { makeDraftShow } from '../helpers.ts';

type Answer = { lat: string; lon: string; category: string; address: { country_code: string } } | null;

function setup(answers: Answer[], cache: GeoCache = emptyCache(), retryMisses = false) {
  let clock = 0;
  const requests: URL[] = [];
  const headers: Record<string, string>[] = [];
  const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
    requests.push(new URL(String(input)));
    headers.push((init?.headers ?? {}) as Record<string, string>);
    const answer = answers.shift();
    if (answer === undefined) throw new Error('unexpected request');
    return new Response(JSON.stringify(answer === null ? [] : [answer]), { status: 200 });
  });
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const geocode = createGeocoder(cache, {
    fetch: fetchMock as unknown as typeof fetch,
    sleep,
    now: () => clock,
    userAgent: 'tour-atlas-geocoder/0.1 (test@example.org)',
    today: '2026-10-16',
    retryMisses,
  });
  return { geocode, requests, headers, sleep, cache, fetchMock };
}

const hit = (lat: number, lon: number, category = 'amenity', countryCode = 'de'): Answer => ({
  lat: String(lat),
  lon: String(lon),
  category,
  address: { country_code: countryCode },
});

const berlin = hit(52.52, 13.405, 'place');

describe('geocoder', () => {
  it('resolves the venue first, rounds coordinates and identifies itself', async () => {
    const { geocode, requests, headers } = setup([hit(52.5301234567, 13.4012345678), berlin]);
    const result = await geocode(makeDraftShow());
    expect(result.geo).toEqual({ lat: 52.53012, lon: 13.40123, precision: 'venue', source: 'nominatim' });
    expect(result.rejectedVenueKm).toBeNull();
    expect(requests[0]?.searchParams.get('q')).toBe('Kulturhaus Nord, Berlin');
    expect(requests[0]?.searchParams.get('countrycodes')).toBe('de');
    expect(requests[1]?.searchParams.get('city')).toBe('Berlin');
    expect(headers[0]?.['User-Agent']).toBe('tour-atlas-geocoder/0.1 (test@example.org)');
  });

  it('falls back to the city when the venue is not found', async () => {
    const { geocode, requests } = setup([null, hit(52.52, 13.405, 'place')]);
    const result = await geocode(makeDraftShow());
    expect(result.geo?.precision).toBe('city');
    expect(requests[1]?.searchParams.get('city')).toBe('Berlin');
  });

  it('downgrades a venue query that only matched the town to city precision', async () => {
    const { geocode } = setup([hit(52.52, 13.405, 'place'), berlin]);
    expect((await geocode(makeDraftShow())).geo?.precision).toBe('city');
  });

  it('keeps a venue result within the distance limit of the city centre', async () => {
    const potsdam = hit(52.39, 13.06);
    const { geocode } = setup([potsdam, berlin]);
    expect((await geocode(makeDraftShow())).geo).toEqual({ lat: 52.39, lon: 13.06, precision: 'venue', source: 'nominatim' });
  });

  it('uses the city centre when the venue result is a namesake far from the city', async () => {
    const munich = hit(48.14, 11.58, 'place');
    const { geocode } = setup([munich, berlin]);
    const result = await geocode(makeDraftShow());
    expect(result.geo).toEqual({ lat: 52.52, lon: 13.405, precision: 'city', source: 'nominatim' });
    expect(result.rejectedVenueKm).toBeGreaterThan(MAX_VENUE_DISTANCE_KM);
    expect(result.rejectedVenueKm).toBe(504);
  });

  it('checks the distance for cached venue answers too', async () => {
    const cache: GeoCache = {
      version: 1,
      entries: {
        'venue|DE|berlin||kulturhaus-nord': { lat: 48.14, lon: 11.58, precision: 'city', retrievedAt: '2026-10-16' },
        'city|DE|berlin|': { lat: 52.52, lon: 13.405, precision: 'city', retrievedAt: '2026-10-16' },
      },
    };
    const { geocode, fetchMock } = setup([], cache);
    const result = await geocode(makeDraftShow());
    expect(result.geo?.lat).toBe(52.52);
    expect(result.fromCache).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the venue result when the city itself cannot be found', async () => {
    const { geocode } = setup([hit(52.53, 13.4), null]);
    expect((await geocode(makeDraftShow())).geo?.precision).toBe('venue');
  });

  it('rejects results from another country', async () => {
    const { geocode } = setup([hit(48.85, 2.35, 'amenity', 'fr'), null]);
    expect((await geocode(makeDraftShow())).geo).toBeNull();
  });

  it('waits at least the minimum interval between requests', async () => {
    const { geocode, sleep } = setup([null, null]);
    await geocode(makeDraftShow());
    expect(sleep).toHaveBeenCalledWith(MIN_REQUEST_INTERVAL_MS);
  });

  it('answers from the cache, including misses, unless asked to retry', async () => {
    const first = setup([hit(52.53, 13.4), berlin]);
    await first.geocode(makeDraftShow());
    const cache = parseCache(serializeCache(first.cache));
    const second = setup([], cache);
    expect((await second.geocode(makeDraftShow())).fromCache).toBe(true);
    expect(second.fetchMock).not.toHaveBeenCalled();

    const misses = setup([null, null]);
    await misses.geocode(makeDraftShow());
    const again = setup([], misses.cache);
    expect((await again.geocode(makeDraftShow())).geo).toBeNull();
    const retry = setup([hit(52.53, 13.4), berlin], misses.cache, true);
    expect((await retry.geocode(makeDraftShow())).geo?.precision).toBe('venue');
  });

  it('stops on HTTP errors instead of retrying', async () => {
    const cache = emptyCache();
    const geocode = createGeocoder(cache, {
      fetch: (async () => new Response('slow down', { status: 429, statusText: 'Too Many Requests' })) as unknown as typeof fetch,
      sleep: async () => {},
      now: () => 0,
      userAgent: 'test',
      today: '2026-10-16',
      retryMisses: false,
    });
    await expect(geocode(makeDraftShow())).rejects.toThrow(/429/);
  });

  it('refuses a malformed cache entry', () => {
    expect(() => parseCache('{"version":1,"entries":{"city|DE|berlin|":{"lat":"52"}}}')).toThrow(/city\|DE\|berlin\|/);
  });

  it('writes the cache with sorted keys', () => {
    const cache: GeoCache = { version: 1, entries: { b: { miss: true, retrievedAt: '2026-10-16' }, a: { miss: true, retrievedAt: '2026-10-16' } } };
    expect(Object.keys((JSON.parse(serializeCache(cache)) as GeoCache).entries)).toEqual(['a', 'b']);
  });
});
