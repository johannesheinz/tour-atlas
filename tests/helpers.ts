import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DraftShow, Show } from '../src/data/types.ts';

export const ROOT = join(import.meta.dirname, '..');

export function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

export function readText(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

export function bandFilesIn(relativeDir: string): string[] {
  return readdirSync(join(ROOT, relativeDir))
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(relativeDir, name));
}

export function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'test-band-2026-11-02-berlin',
    date: '2026-11-02',
    endDate: null,
    startTime: '20:00',
    tourName: 'Test Tour',
    eventName: null,
    venue: 'Kulturhaus Nord',
    city: 'Berlin',
    region: null,
    countryCode: 'DE',
    status: 'scheduled',
    ticketUrl: 'https://tickets.example.org/test-band/2026-11-02',
    sourceUrl: 'https://example.com/test-band/tour',
    notes: null,
    geo: { lat: 52.52, lon: 13.405, precision: 'city', source: 'manual' },
    ...overrides,
  };
}

export function makeDraftShow(overrides: Partial<DraftShow> = {}): DraftShow {
  return { ...makeShow(), id: null, geo: null, ...overrides };
}

export function makeFile<S>(shows: readonly S[], bandId = 'test-band') {
  return {
    schemaVersion: 1 as const,
    band: { id: bandId, name: 'Test Band', color: null },
    source: { url: 'https://example.com/test-band/tour', retrievedAt: '2026-10-16' },
    shows,
  };
}
