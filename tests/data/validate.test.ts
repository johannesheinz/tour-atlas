import { describe, expect, it } from 'vitest';
import {
  formatIssue,
  parseBandJson,
  validateCollection,
  validateDraft,
  validateFileName,
  validateRepository,
} from '../../src/data/validate.ts';
import { VALID_SAMPLES, bandFilesIn, makeDraftShow, makeFile, makeShow, readJson } from '../helpers.ts';

function rowMessages(show: unknown, mode: 'draft' | 'repository' = 'repository'): string[] {
  const file = makeFile([show]);
  const result = mode === 'repository' ? validateRepository(file, 'test-band.json') : validateDraft(file, 'test-band.json');
  return result.issues.map(formatIssue);
}

describe('validateRepository', () => {
  it.each([...VALID_SAMPLES, ...bandFilesIn('data/bands')])('accepts %s', (path) => {
    const result = validateRepository(readJson(path), path);
    expect(result.issues).toEqual([]);
    expect(result.value?.shows.length).toBe(result.totalShows);
  });

  it('accepts a complete show', () => {
    expect(rowMessages(makeShow())).toEqual([]);
  });

  it.each([
    ['date format', { date: '17 Oct' }, 'test-band.json shows[0].date: "17 Oct" is not YYYY-MM-DD'],
    ['impossible date', { date: '2026-02-30' }, 'shows[0].date: "2026-02-30" is not a real calendar date'],
    ['year range', { date: '1890-05-01' }, 'shows[0].date: "1890-05-01" is outside the years 1950–2100'],
    ['end before start', { endDate: '2026-11-01' }, 'shows[0].endDate: "2026-11-01" is before date "2026-11-02"'],
    ['end too late', { endDate: '2026-12-01' }, 'shows[0].endDate: is 29 days after date; the limit is 14'],
    ['start time', { startTime: '8pm' }, 'shows[0].startTime: "8pm" is not HH:MM (24-hour clock)'],
    ['country format', { countryCode: 'de' }, 'shows[0].countryCode: "de" is not a two-letter uppercase country code'],
    ['country list', { countryCode: 'XX' }, 'shows[0].countryCode: "XX" is not an ISO 3166-1 alpha-2 country code'],
    ['status', { status: 'maybe' }, 'shows[0].status: "maybe" is not one of scheduled, cancelled, postponed, soldout'],
    ['url scheme', { ticketUrl: 'javascript:alert(1)' }, 'shows[0].ticketUrl: "javascript:alert(1)" is not an http(s) URL'],
    ['empty text', { venue: '' }, 'shows[0].venue: is empty (use null when unknown)'],
    ['bidi override', { notes: '‮evil' }, 'shows[0].notes: contains control or text-direction characters'],
    ['text length', { notes: 'x'.repeat(501) }, 'shows[0].notes: is 501 characters long; the limit is 500'],
    ['non-latin city', { city: '東京' }, 'shows[0].city: city "東京" has no Latin letters or digits to build an id from'],
    ['id format', { id: 'show-14' }, 'shows[0].id: "show-14" must look like "test-band-YYYY-MM-DD-<city>"'],
    ['id characters', { id: 'Test Band' }, 'shows[0].id: "Test Band" must contain only a–z, 0–9 and hyphens'],
    ['wrong type', { city: 42 }, 'shows[0].city: must be text (got 42)'],
    ['latitude range', { geo: { lat: 123.4, lon: 13.4, precision: 'city', source: 'manual' } }, 'shows[0].geo.lat: lat 123.4 is outside -90…90'],
    ['longitude range', { geo: { lat: 52, lon: 181, precision: 'city', source: 'manual' } }, 'shows[0].geo.lon: lon 181 is outside -180…180'],
    ['geo precision', { geo: { lat: 52, lon: 13, precision: 'street', source: 'manual' } }, 'shows[0].geo.precision: "street" is not one of venue, city'],
    ['missing geo', { geo: null }, 'shows[0].geo: missing coordinates; run "npm run geocode"'],
    ['missing id', { id: null }, 'shows[0].id: missing; run "npm run normalize" to generate it'],
  ])('reports %s', (_name, overrides, expected) => {
    const messages = rowMessages({ ...makeShow(), ...overrides });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(expected);
  });

  it('reports unknown and missing fields', () => {
    const { venue: _venue, ...withoutVenue } = makeShow();
    expect(rowMessages({ ...withoutVenue, price: '25 EUR' })).toEqual([
      'test-band.json shows[0].price: unknown field',
      'test-band.json shows[0].venue: missing (use null when unknown)',
    ]);
  });

  it('rejects duplicate show ids and keeps the first', () => {
    const first = makeShow();
    const second = makeShow({ date: '2026-11-03' });
    const result = validateRepository(makeFile([first, second]), 'test-band.json');
    expect(result.issues.map(formatIssue)).toEqual([
      'test-band.json shows[1].id: duplicate id "test-band-2026-11-02-berlin" (also used by shows[0])',
    ]);
    expect(result.value?.shows).toEqual([first]);
    expect(result.rejectedShowIndexes).toEqual([1]);
  });

  it('keeps valid rows next to invalid ones', () => {
    const result = validateRepository(readJson('samples/broken-lanterns.json'), 'broken-lanterns.json');
    expect(result.totalShows).toBe(16);
    expect(result.value?.shows.map((show) => show.city)).toEqual(['Berlin']);
    expect(result.rejectedShowIndexes).toHaveLength(15);
  });

  it('rejects file-level problems', () => {
    const file = { ...makeFile([makeShow()]), schemaVersion: 2, band: { id: 'Test Band', name: 'Test', color: '#FFF', tags: [] } };
    const result = validateRepository(file, 'test-band.json');
    expect(result.value).toBeNull();
    expect(result.issues.map(formatIssue)).toEqual([
      'test-band.json schemaVersion: must be 1 (got 2)',
      'test-band.json band.id: "Test Band" must be a lowercase slug like "glass-harbor"',
      'test-band.json band.color: "#FFF" is not a lowercase hex colour like "#3a7bd5"',
    ]);
  });

  it.each([
    ['unknown tag', ['doom-metal', 'polka'], 'band.tags[1]: "polka" is not in data/tags.json; add it there in the same pull request or remove it'],
    ['duplicate tag', ['nordic', 'nordic'], 'band.tags[1]: "nordic" is listed twice'],
    ['not a list', 'nordic', 'band.tags: must be a list of tag ids (got "nordic"); use [] for none'],
  ])('reports %s', (_name, tags, expected) => {
    const file = { ...makeFile([makeShow()]), band: { id: 'test-band', name: 'Test Band', color: null, tags } };
    const result = validateRepository(file, 'test-band.json');
    expect(result.value).toBeNull();
    expect(result.issues.map(formatIssue)).toEqual([`test-band.json ${expected}`]);
  });

  it('rejects input that is not an object', () => {
    expect(validateRepository([], 'x.json').issues.map(formatIssue)).toEqual(['x.json: must be an object (got a list)']);
  });

  it('caps the number of shows per file', () => {
    const result = validateRepository(makeFile(Array.from({ length: 2001 }, () => makeShow())), 'test-band.json');
    expect(result.issues.map(formatIssue)).toEqual(['test-band.json shows: has 2001 shows; the limit per file is 2000']);
  });
});

describe('validateDraft', () => {
  it('accepts shows without id and geo', () => {
    expect(rowMessages(makeDraftShow(), 'draft')).toEqual([]);
  });

  it('accepts the draft sample', () => {
    expect(validateDraft(readJson('samples/draft/ashen-choir.json'), 'ashen-choir.json').issues).toEqual([]);
  });
});

describe('file and collection checks', () => {
  it('requires the file name to match band.id', () => {
    expect(validateFileName('data/bands/glass-harbor.json', 'glass-harbor')).toBeNull();
    expect(validateFileName('data/bands/Glass Harbor (1).json', 'glass-harbor')?.message).toBe(
      'file name must be "glass-harbor.json" to match band.id',
    );
  });

  it('reports duplicate band ids across files', () => {
    const issues = validateCollection([
      { file: 'a.json', bandId: 'glass-harbor' },
      { file: 'b.json', bandId: 'glass-harbor' },
    ]);
    expect(issues.map(formatIssue)).toEqual(['b.json band.id: "glass-harbor" is already used by a.json']);
  });

  it('reports unparseable JSON', () => {
    const parsed = parseBandJson('{ "band": ', 'x.json');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(formatIssue(parsed.issue)).toMatch(/^x\.json: is not valid JSON \(/);
  });
});
