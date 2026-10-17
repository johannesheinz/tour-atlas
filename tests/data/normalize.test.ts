import { describe, expect, it } from 'vitest';
import { normalizeBandFile, serializeBandFile } from '../../src/data/normalize';
import { validateDraft } from '../../src/data/validate';
import { bandFilesIn, makeDraftShow, makeFile, readJson, readText } from '../helpers';

function normalizeText(input: unknown): string {
  const result = validateDraft(input, 'test-band.json');
  if (result.value === null || result.issues.length > 0) throw new Error(JSON.stringify(result.issues));
  return serializeBandFile(normalizeBandFile(result.value));
}

describe('normalize', () => {
  it.each([...bandFilesIn('data/bands'), 'samples/draft/ashen-choir.json'])('is idempotent for %s', (path) => {
    const once = normalizeText(readJson(path));
    expect(normalizeText(JSON.parse(once))).toBe(once);
  });

  it.each(bandFilesIn('data/bands'))('leaves the committed %s unchanged', (path) => {
    expect(normalizeText(readJson(path))).toBe(readText(path));
  });

  it('sorts by date then id, generates ids, trims text and orders keys', () => {
    const shuffled = makeFile([
      { ...makeDraftShow({ date: '2026-11-03', city: ' Hamburg ', venue: '  Grosse Freiheit  ' }) },
      Object.fromEntries(Object.entries(makeDraftShow({ date: '2026-11-02', city: 'Berlin' })).toReversed()),
    ]);
    const text = normalizeText(shuffled);
    const parsed = JSON.parse(text) as { shows: { id: string; city: string; venue: string }[] };
    expect(parsed.shows.map((show) => show.id)).toEqual(['test-band-2026-11-02-berlin', 'test-band-2026-11-03-hamburg']);
    expect(parsed.shows[1]?.city).toBe('Hamburg');
    expect(parsed.shows[1]?.venue).toBe('Grosse Freiheit');
    expect(Object.keys(parsed.shows[0] ?? {})).toEqual([
      'id', 'date', 'endDate', 'startTime', 'tourName', 'eventName', 'venue', 'city', 'region',
      'countryCode', 'status', 'ticketUrl', 'sourceUrl', 'notes', 'geo',
    ]);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.split('\n')[1]).toBe('  "schemaVersion": 1,');
  });
});
