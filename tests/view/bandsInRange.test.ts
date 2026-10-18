import { describe, expect, it } from 'vitest';
import { parseIsoDate } from '../../src/data/dates.ts';
import type { BandFile } from '../../src/data/types.ts';
import { buildBandEntries, dateRange, isInRange, showRefs, showsInRange, sortBands, type BandEntry } from '../../src/model.ts';
import { makeFile, makeShow } from '../helpers.ts';

const day = (iso: string) => parseIsoDate(iso).getTime();
const today = '2026-10-16';
const named = (id: string, name: string, dates: readonly string[]) => {
  const file = makeFile(dates.map((date) => makeShow({ id: `${id}-${date}-berlin`, date })), id) as BandFile;
  return { ...file, band: { ...file.band, name } };
};
const bands = buildBandEntries(
  [
    named('busy', 'Busy', ['2026-09-01', '2026-09-02', '2026-09-03', '2026-11-20']),
    named('soon', 'Soon', ['2026-10-20', '2026-10-21']),
    named('later', 'Later', ['2026-12-05']),
  ],
  [],
);
const refs = new Map(bands.map((band) => [band, showRefs(band, today)]));
const autumn = { start: day('2026-10-14'), end: day('2026-12-31') };
const inAutumn = (band: BandEntry) => showsInRange(refs.get(band) ?? [], autumn);
const names = (list: readonly BandEntry[]) => list.map((band) => band.file.band.name);

describe('bands in the time range', () => {
  it('counts only shows in the range, all of them without one', () => {
    const [busy] = bands;
    if (busy === undefined) throw new Error('fixture missing');
    expect(inAutumn(busy)).toHaveLength(1);
    expect(showsInRange(refs.get(busy) ?? [], null)).toHaveLength(4);
  });

  it('sorts by shows in the range, not by all shows', () => {
    expect(names(sortBands(bands, 'show-count', inAutumn))).toEqual(['Soon', 'Busy', 'Later']);
  });

  it('sorts by the next upcoming show in the range, bands without one last', () => {
    expect(names(sortBands(bands, 'next-show', inAutumn))).toEqual(['Soon', 'Busy', 'Later']);
    const winter = { start: day('2026-12-01'), end: day('2026-12-31') };
    expect(names(sortBands(bands, 'next-show', (band) => showsInRange(refs.get(band) ?? [], winter)))).toEqual(['Later', 'Busy', 'Soon']);
  });

  it('describes the span of the shows it is given', () => {
    const [, soon] = bands;
    if (soon === undefined) throw new Error('fixture missing');
    expect(dateRange(inAutumn(soon))).toEqual({ first: '2026-10-20', last: '2026-10-21' });
    expect(dateRange([])).toBeNull();
  });

  it('counts a show when the middle of its day is in the range, robust to rounding at midnight', () => {
    const [, soon] = bands;
    if (soon === undefined) throw new Error('fixture missing');
    const [first] = refs.get(soon) ?? [];
    if (first === undefined) throw new Error('fixture missing');
    const showDay = day('2026-10-20');
    for (const drift of [-1, 0, 1]) {
      expect(isInRange(first, { start: showDay + drift, end: showDay + 30 * 86_400_000 })).toBe(true);
      expect(isInRange(first, { start: showDay + 86_400_000 + drift, end: showDay + 30 * 86_400_000 })).toBe(false);
    }
    expect(isInRange(first, { start: showDay - 30 * 86_400_000, end: showDay })).toBe(false);
  });
});
