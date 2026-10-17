import { describe, expect, it } from 'vitest';
import { NO_SELECTION } from '../../src/appState.ts';
import { parseIsoDate } from '../../src/data/dates.ts';
import type { BandFile } from '../../src/data/types.ts';
import { buildBandEntries, showRefs } from '../../src/model.ts';
import { selectionShows } from '../../src/selection.ts';
import { makeFile, makeShow } from '../helpers.ts';

const day = (iso: string) => parseIsoDate(iso).getTime();

const testBand = makeFile([
  makeShow({ id: 'test-band-2027-03-02-berlin', date: '2027-03-02' }),
  makeShow({ id: 'test-band-2026-11-02-berlin', date: '2026-11-02' }),
  makeShow({ id: 'test-band-2026-12-01-sao-paulo', date: '2026-12-01', city: 'São Paulo', countryCode: 'BR' }),
]) as BandFile;
const otherBand = makeFile([makeShow({ id: 'other-band-2026-11-10-berlin', date: '2026-11-10' })], 'other-band') as BandFile;

const bands = buildBandEntries([testBand, otherBand], []);
const refsByBand = new Map(bands.map((band) => [band, showRefs(band, '2026-10-16')]));
const allShows = [...refsByBand.values()].flat();
const derived = { visibleShows: allShows, showsById: new Map(allShows.map((ref) => [ref.show.id, ref])), refsByBand };
const autumn = { start: day('2026-11-01'), end: day('2026-12-31') };
const ids = (refs: readonly { show: { id: string } }[]) => refs.map((ref) => ref.show.id);

describe('selectionShows', () => {
  it('lists a band by date, limited to the time window and following it', () => {
    const band = { kind: 'band', bandId: 'test-band' } as const;
    expect(ids(selectionShows(band, autumn, derived))).toEqual(['test-band-2026-11-02-berlin', 'test-band-2026-12-01-sao-paulo']);
    expect(ids(selectionShows(band, { start: day('2027-01-01'), end: day('2027-12-31') }, derived))).toEqual(['test-band-2027-03-02-berlin']);
    expect(selectionShows(band, null, derived)).toHaveLength(3);
  });

  it('keeps listing a band after it is hidden from the map, and nothing for an unknown band', () => {
    const hidden = { ...derived, visibleShows: allShows.filter((ref) => ref.band.file.band.id !== 'test-band') };
    expect(selectionShows({ kind: 'band', bandId: 'test-band' }, autumn, hidden)).toHaveLength(2);
    expect(selectionShows({ kind: 'band', bandId: 'missing' }, autumn, derived)).toEqual([]);
  });

  it('resolves places to the visible shows in the window, across bands', () => {
    const berlin = { kind: 'places', places: new Set(['de.berlin']) } as const;
    expect(ids(selectionShows(berlin, autumn, derived))).toEqual(['test-band-2026-11-02-berlin', 'other-band-2026-11-10-berlin']);
  });

  it('keeps picked shows regardless of the window and drops unknown ids', () => {
    const picked = { kind: 'shows', showIds: new Set(['test-band-2027-03-02-berlin', 'other-band-2026-11-10-berlin', 'gone']) } as const;
    expect(ids(selectionShows(picked, autumn, derived))).toEqual(['other-band-2026-11-10-berlin', 'test-band-2027-03-02-berlin']);
    expect(selectionShows(NO_SELECTION, autumn, derived)).toEqual([]);
  });
});
