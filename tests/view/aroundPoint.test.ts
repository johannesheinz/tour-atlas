import { afterEach, describe, expect, it } from 'vitest';
import type { BandFile, Show } from '../../src/data/types.ts';
import { useLocale } from '../../src/i18n/index.ts';
import { buildBandEntries, showRefs, type ShowRef } from '../../src/model.ts';
import { aroundOf, mapViewFromUrl, parseUrlState, serializeUrlState } from '../../src/urlState.ts';
import { nearestCity, placeCenter, pointView, roundPoint } from '../../src/view/aroundPoint.ts';
import { formatCoordinates } from '../../src/view/format.ts';
import { findRegion, type MapViewPreset } from '../../src/view/mapRegions.ts';
import { makeFile, makeShow } from '../helpers.ts';

type Geo = Show['geo'];
const cityGeo = (lat: number, lon: number): Geo => ({ lat, lon, precision: 'city', source: 'manual' });
const venueGeo = (lat: number, lon: number): Geo => ({ lat, lon, precision: 'venue', source: 'nominatim' });

function refs(shows: readonly Partial<Show>[]): ShowRef[] {
  const file = makeFile(shows.map((show, index) => makeShow({ id: `test-band-2026-11-${String(index + 1).padStart(2, '0')}-x`, ...show }))) as BandFile;
  const [band] = buildBandEntries([file], []);
  if (band === undefined) throw new Error('band missing');
  return showRefs(band, '2026-10-16');
}

const HELSINKI: Partial<Show> = { city: 'Helsinki', countryCode: 'FI', geo: cityGeo(60.17, 24.94) };
const ESPOO: Partial<Show> = { city: 'Espoo', countryCode: 'FI', geo: cityGeo(60.21, 24.66) };
const TALLINN: Partial<Show> = { city: 'Tallinn', countryCode: 'EE', geo: cityGeo(59.44, 24.75) };

afterEach(() => useLocale({ language: 'en', clock: null, distance: null }, ['en-GB']));

describe('the around point in the URL', () => {
  const base = parseUrlState('');
  const helsinki50 = { center: [24.94, 60.17] as const, radius: { value: 50, unit: 'km' as const } };

  it('writes lat,lon with two decimals and the radius with its unit', () => {
    expect(serializeUrlState({ ...base, around: helsinki50 })).toBe('#around=60.17,24.94&radius=50km');
    expect(serializeUrlState({ ...base, around: { center: [24.93849, 60.16952], radius: { value: 2.5, unit: 'mil' } } })).toBe('#around=60.17,24.94&radius=2.5mil');
    expect(serializeUrlState({ ...base, around: { center: [-0.0041, -33.8688], radius: { value: 30, unit: 'mi' } } })).toBe('#around=-33.87,0&radius=30mi');
  });

  it('reads it back, rounding longer coordinates to two decimals', () => {
    expect(parseUrlState('#around=60.17,24.94&radius=50km').around).toEqual(helsinki50);
    expect(parseUrlState('#around=60.16952,24.93849&radius=50km').around).toEqual(helsinki50);
    expect(parseUrlState('#around=-33.87,151.21&radius=2.5mil').around).toEqual({ center: [151.21, -33.87], radius: { value: 2.5, unit: 'mil' } });
  });

  it('round-trips with the rest of the view', () => {
    const state = { ...parseUrlState('#hide=a,b&when=past&style=bold'), around: helsinki50 };
    expect(parseUrlState(serializeUrlState(state))).toEqual(state);
  });

  it('ignores malformed points, radii the menu does not offer and either half alone', () => {
    for (const hash of [
      '#around=60.17,24.94',
      '#radius=50km',
      '#around=91,24.94&radius=50km',
      '#around=60.17,181&radius=50km',
      '#around=60.17;24.94&radius=50km',
      '#around=north,east&radius=50km',
      '#around=60.17,24.94,3&radius=50km',
      '#around=60.17,24.94&radius=37km',
      '#around=60.17,24.94&radius=50',
      '#around=60.17,24.94&radius=50furlong',
      '#around=60.17,24.94&radius=-50km',
      '#around=60.17,24.94&radius=2.5km',
    ]) {
      expect(parseUrlState(hash).around, hash).toBeNull();
    }
  });

  it('puts only a picked point in the URL, never Near me', () => {
    expect(aroundOf({ kind: 'near', radius: { value: 50, unit: 'km' } })).toBeNull();
    expect(aroundOf({ kind: 'shows' })).toBeNull();
    expect(serializeUrlState({ ...base, around: aroundOf({ kind: 'near', radius: { value: 50, unit: 'km' } }) })).toBe('');
    expect(aroundOf(pointView([24.9384, 60.1695], { value: 50, unit: 'km' }))).toEqual(helsinki50);
  });

  it('restores the point, which wins over a region', () => {
    expect(mapViewFromUrl(parseUrlState('#around=60.17,24.94&radius=50km&view=europe'))).toEqual({ kind: 'point', ...helsinki50 });
    expect(mapViewFromUrl(parseUrlState('#view=europe'))).toEqual({ kind: 'region', region: findRegion('europe') });
    expect(mapViewFromUrl(parseUrlState('#view=atlantis'))).toEqual({ kind: 'shows' });
  });
});

describe('a picked point', () => {
  it('rounds to two decimals like the URL, wrapping the longitude', () => {
    expect(roundPoint([24.93849, 60.16952])).toEqual([24.94, 60.17]);
    expect(roundPoint([-0.001, -0.004])).toEqual([0, 0]);
    expect(roundPoint([190.004, 10])).toEqual([-170, 10]);
    const view: MapViewPreset = pointView([24.93849, 60.16952], { value: 25, unit: 'km' });
    expect(view).toEqual({ kind: 'point', center: [24.94, 60.17], radius: { value: 25, unit: 'km' } });
  });
});

describe('nearestCity', () => {
  const shows = refs([TALLINN, ESPOO, HELSINKI]);

  it('names the city of the closest show inside the radius', () => {
    expect(nearestCity(shows, [24.9, 60.18], 50)?.city).toBe('Helsinki');
    expect(nearestCity(shows, [24.7, 60.2], 50)?.city).toBe('Espoo');
    expect(nearestCity(shows, [24.8, 59.5], 25)).toEqual(expect.objectContaining({ city: 'Tallinn', key: 'ee.tallinn' }));
  });

  it('is null when no show lies inside the radius, so the coordinates name the point', () => {
    expect(nearestCity(shows, [20, 60], 25)).toBeNull();
    expect(nearestCity([], [24.94, 60.17], 1000)).toBeNull();
    expect(formatCoordinates([20, 60])).toBe('60.00°\u00a0N, 20.00°\u00a0E');
    expect(formatCoordinates([-58.38, -34.6])).toBe('34.60°\u00a0S, 58.38°\u00a0W');
  });

  it('formats the coordinates in the active language', () => {
    useLocale({ language: 'de', clock: null, distance: null }, ['de-DE']);
    expect(formatCoordinates([24.94, 60.17])).toBe('60,17°\u00a0N, 24,94°\u00a0O');
    useLocale({ language: 'la', clock: null, distance: null }, ['la']);
    expect(formatCoordinates([-58.38, -34.6])).toBe('34,60°\u00a0Mer., 58,38°\u00a0Occ.');
    useLocale({ language: 'eo', clock: null, distance: null }, ['eo']);
    expect(formatCoordinates([-58.38, 34.6])).toBe('34,60°\u00a0N, 58,38°\u00a0U');
  });

  it('breaks a tie by city key, then name, whatever the order of the data', () => {
    const twins = [
      { city: 'Bergstadt', countryCode: 'DE', geo: cityGeo(50, 10) },
      { city: 'Altstadt', countryCode: 'DE', geo: cityGeo(50, 10) },
    ] as const;
    expect(nearestCity(refs(twins), [10, 50.1], 50)?.city).toBe('Altstadt');
    expect(nearestCity(refs(twins.toReversed()), [10, 50.1], 50)?.city).toBe('Altstadt');
  });

  it('names a place at its own centre, as the place panel sets it', () => {
    const data = refs([TALLINN, ESPOO, HELSINKI, { ...HELSINKI, venue: 'Tavastia', geo: venueGeo(60.1698, 24.9306) }]);
    for (const city of ['Helsinki', 'Espoo', 'Tallinn']) {
      const center = placeCenter(data.filter((ref) => ref.show.city === city));
      expect(nearestCity(data, center, 25)?.city, city).toBe(city);
    }
  });
});

describe('placeCenter', () => {
  it('takes the only spot of the shows, else the city pin, else the middle of the venues', () => {
    expect(placeCenter(refs([{ ...HELSINKI, geo: venueGeo(60.16981, 24.93062) }]))).toEqual([24.93, 60.17]);
    expect(placeCenter(refs([{ ...HELSINKI, geo: venueGeo(60.1, 24.8) }, HELSINKI]))).toEqual([24.94, 60.17]);
    expect(placeCenter(refs([{ ...HELSINKI, geo: venueGeo(60.1, 24.8) }, { ...HELSINKI, geo: venueGeo(60.2, 25) }]))).toEqual([24.9, 60.15]);
    expect(() => placeCenter([])).toThrow(RangeError);
  });
});
