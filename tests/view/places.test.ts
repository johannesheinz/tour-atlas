import { describe, expect, it } from 'vitest';
import { parseIsoDate } from '../../src/data/dates.ts';
import type { BandFile } from '../../src/data/types.ts';
import { buildBandEntries, showRefs } from '../../src/model.ts';
import { PLACE_KEY_PATTERN, buildPlaces, cityKey, describePlaces, showsAtPlaces } from '../../src/places.ts';
import { makeFile, makeShow } from '../helpers.ts';

const day = (iso: string) => parseIsoDate(iso).getTime();
const names: Record<string, string> = { DE: 'Germany', BR: 'Brazil' };
const countryName = (code: string) => names[code] ?? code;

const file = makeFile([
  makeShow({ id: 'test-band-2026-11-02-berlin', date: '2026-11-02' }),
  makeShow({ id: 'test-band-2027-03-02-berlin', date: '2027-03-02', venue: 'Other Hall' }),
  makeShow({ id: 'test-band-2026-11-05-hamburg', date: '2026-11-05', city: 'Hamburg' }),
  makeShow({ id: 'test-band-2026-12-01-sao-paulo', date: '2026-12-01', city: 'São Paulo', countryCode: 'BR' }),
]) as BandFile;
const [band] = buildBandEntries([file], []);
if (band === undefined) throw new Error('band missing');
const refs = showRefs(band, '2026-10-16');
const window = { start: day('2026-11-01'), end: day('2026-12-31') };

describe('places', () => {
  it('builds keys that fit the URL', () => {
    expect(refs.map(cityKey)).toEqual(['de.berlin', 'de.berlin', 'de.hamburg', 'br.sao-paulo']);
    expect(refs.map(cityKey).every((key) => PLACE_KEY_PATTERN.test(key))).toBe(true);
  });

  it('lists countries and cities with shows in the window', () => {
    const places = buildPlaces(refs, window, countryName);
    expect(places.map((country) => [country.name, country.showCount])).toEqual([['Brazil', 1], ['Germany', 2]]);
    expect(places[1]?.cities.map((city) => [city.city, city.showCount])).toEqual([['Berlin', 1], ['Hamburg', 1]]);
  });

  it('selects all shows at a city or country inside the window', () => {
    expect(showsAtPlaces(refs, new Set(['de.berlin']), window).map((ref) => ref.show.id)).toEqual(['test-band-2026-11-02-berlin']);
    expect(showsAtPlaces(refs, new Set(['de.berlin']), null)).toHaveLength(2);
    expect(showsAtPlaces(refs, new Set(['de']), window)).toHaveLength(2);
  });

  it('names a selection', () => {
    expect(describePlaces(new Set(['br.sao-paulo']), refs, countryName)).toBe('São Paulo');
    expect(describePlaces(new Set(['de', 'br.sao-paulo']), refs, countryName)).toBe('Germany and 1 more');
  });
});
