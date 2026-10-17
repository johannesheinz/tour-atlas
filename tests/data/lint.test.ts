import { describe, expect, it } from 'vitest';
import { lintBandFile } from '../../src/data/lint.ts';
import { formatIssue } from '../../src/data/validate.ts';
import { loadCountryLocator } from '../../tools/shared/files.ts';
import { makeFile, makeShow } from '../helpers.ts';

const locateCountry = loadCountryLocator();
const lint = (shows: Parameters<typeof makeFile>[0], today = '2026-10-16') =>
  lintBandFile('test-band.json', makeFile(shows) as Parameters<typeof lintBandFile>[1], { today, locateCountry }).map(formatIssue);

describe('country locator', () => {
  it.each([
    [13.405, 52.52, 'DE'],
    [-46.6333, -23.5505, 'BR'],
    [174.7633, -36.8485, 'NZ'],
    [-157.8581, 21.3099, 'US'],
    [-30, 40, null],
  ])('(%d, %d) → %s', (lon, lat, expected) => {
    expect(locateCountry(lon, lat)).toBe(expected);
  });
});

describe('lintBandFile', () => {
  it('is quiet for plausible data', () => {
    expect(lint([makeShow(), makeShow({ id: 'test-band-2026-11-03-hamburg', date: '2026-11-03', city: 'Hamburg' })])).toEqual([]);
  });

  it('flags coordinates in another country', () => {
    expect(lint([makeShow({ countryCode: 'FR' })])).toEqual([
      'test-band.json shows[0].geo: coordinates fall inside DE, but countryCode is FR',
    ]);
  });

  it('gives venues right at a border the benefit of the doubt', () => {
    const elPaso = makeShow({ city: 'El Paso', region: 'TX', countryCode: 'US', geo: { lat: 31.75751, lon: -106.49076, precision: 'venue', source: 'nominatim' } });
    const nickelsdorf = makeShow({ id: 'test-band-2026-11-03-nickelsdorf', date: '2026-11-03', city: 'Nickelsdorf', countryCode: 'AT', geo: { lat: 47.9138, lon: 17.08954, precision: 'venue', source: 'nominatim' } });
    expect(lint([elPaso, nickelsdorf])).toEqual([]);
  });

  it('accepts territories drawn inside their parent country', () => {
    const cayenne = makeShow({ city: 'Cayenne', countryCode: 'GF', geo: { lat: 4.9224, lon: -52.3135, precision: 'city', source: 'manual' } });
    expect(lint([cayenne])).toEqual([]);
  });

  it('flags far-apart shows on the same day', () => {
    const paris = makeShow({ id: 'test-band-2026-11-02-paris', city: 'Paris', countryCode: 'FR', geo: { lat: 48.8566, lon: 2.3522, precision: 'city', source: 'manual' } });
    expect(lint([makeShow(), paris])).toEqual([
      'test-band.json shows[1].date: same day as shows[0] (Berlin) but 877 km away; check the date',
    ]);
  });

  it('does not compare festivals whose day is not announced yet', () => {
    const rockAmRing = makeShow({ id: 'test-band-2027-06-04-nurburg', date: '2027-06-04', endDate: '2027-06-06', city: 'Nürburg', geo: { lat: 50.34, lon: 6.95, precision: 'city', source: 'nominatim' } });
    const rockImPark = makeShow({ id: 'test-band-2027-06-04-nuremberg', date: '2027-06-04', endDate: '2027-06-06', city: 'Nuremberg', geo: { lat: 49.43, lon: 11.12, precision: 'venue', source: 'nominatim' } });
    expect(lint([rockAmRing, rockImPark])).toEqual([]);
  });

  it('flags likely duplicates but not matinee and evening shows', () => {
    expect(lint([makeShow(), makeShow({ id: 'test-band-2026-11-02-berlin-2' })])).toEqual([
      'test-band.json shows[1]: looks like a duplicate of shows[0] (same date, city and venue)',
    ]);
    expect(lint([makeShow(), makeShow({ id: 'test-band-2026-11-02-berlin-2', startTime: '15:00' })])).toEqual([]);
  });

  it('flags stale sources and far-future dates', () => {
    expect(lint([makeShow({ date: '2030-06-01', id: 'test-band-2030-06-01-berlin' })], '2027-03-01')).toEqual([
      'test-band.json source.retrievedAt: is 136 days old; refresh the data from source.url',
      'test-band.json shows[0].date: is more than three years ahead; check the year',
    ]);
  });
});
