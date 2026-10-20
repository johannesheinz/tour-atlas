import { describe, expect, it } from 'vitest';
import { buildBandEntries, showRefs } from '../../src/model.ts';
import type { BandFile } from '../../src/data/types.ts';
import { placeLabels } from '../../src/view/labels.ts';
import { clusterGroups, compareByProminence, groupByCoordinates, paintOrder, pinLabel, type DisplayPin } from '../../src/view/pins.ts';
import { makeFile, makeShow } from '../helpers.ts';

const berlin = { lat: 52.52, lon: 13.405, precision: 'city' as const, source: 'manual' as const };
const potsdam = { lat: 52.39, lon: 13.06, precision: 'city' as const, source: 'manual' as const };

function refs() {
  const file = makeFile([
    makeShow({ id: 'test-band-2026-11-02-berlin', date: '2026-11-02', geo: berlin }),
    makeShow({ id: 'test-band-2026-11-03-berlin', date: '2026-11-03', geo: berlin, status: 'cancelled' }),
    makeShow({ id: 'test-band-2026-11-04-potsdam', date: '2026-11-04', city: 'Potsdam', geo: potsdam }),
  ]) as BandFile;
  const [band] = buildBandEntries([file], []);
  if (band === undefined) throw new Error('no band');
  return showRefs(band, '2026-11-03');
}

describe('pins', () => {
  it('merges shows at identical coordinates', () => {
    const groups = groupByCoordinates(refs());
    expect(groups.map((group) => group.shows.length)).toEqual([2, 1]);
  });

  it('clusters groups that are close on screen, anchored at the biggest', () => {
    const groups = groupByCoordinates(refs());
    const projected = groups.map((group, index) => ({ group, x: 100 + index * 8, y: 100 }));
    const [pin, ...rest] = clusterGroups(projected, 12);
    expect(rest).toEqual([]);
    expect(pin?.shows).toHaveLength(3);
    expect(pin?.x).toBe(100);
    expect(pin && pinLabel(pin)).toBe('Berlin +1');
    expect(pin?.allPast).toBe(false);
    expect(pin?.allCancelled).toBe(false);
  });

  it('keeps distant groups apart', () => {
    const groups = groupByCoordinates(refs());
    const projected = groups.map((group, index) => ({ group, x: 100 + index * 50, y: 100 }));
    expect(clusterGroups(projected, 12)).toHaveLength(2);
  });
});

describe('paintOrder', () => {
  /** One pin per entry, far apart on screen: [latitude, show count]. */
  function pinsWithCounts(entries: readonly (readonly [number, number])[]): DisplayPin[] {
    const shows = entries.flatMap(([lat, count]) =>
      Array.from({ length: count }, (_, index) => {
        const date = new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10);
        return makeShow({ id: `test-band-${date}-lat-${lat}`, date, geo: { lat, lon: 0, precision: 'city', source: 'manual' } });
      }),
    );
    const [band] = buildBandEntries([makeFile(shows) as BandFile], []);
    if (band === undefined) throw new Error('no band');
    const projected = groupByCoordinates(showRefs(band, '2026-10-01')).map((group) => ({ group, x: group.lat * 100, y: 0 }));
    return clusterGroups(projected, 12);
  }

  const summary = (pins: readonly DisplayPin[]) => pins.map((pin) => [pin.id, pin.shows.length]);

  it('paints the busiest pin last, so it sits on top', () => {
    const pins = pinsWithCounts([[10, 21], [20, 35], [30, 1], [40, 4]]);
    expect(paintOrder(pins).map((pin) => pin.shows.length)).toEqual([1, 4, 21, 35]);
  });

  it('breaks ties by id, the smallest id on top', () => {
    const pins = pinsWithCounts([[30, 2], [10, 2], [20, 2]]);
    expect(paintOrder(pins).map((pin) => pin.id)).toEqual(['30.00000,0.00000', '20.00000,0.00000', '10.00000,0.00000']);
  });

  it('gives the same stack whatever order the pins arrive in', () => {
    const pins = pinsWithCounts([[10, 3], [20, 3], [30, 5], [40, 1]]);
    const expected = summary(paintOrder(pins));
    const permutations = (items: readonly DisplayPin[]): DisplayPin[][] =>
      items.length <= 1 ? [[...items]] : items.flatMap((item, index) => permutations(items.toSpliced(index, 1)).map((rest) => [item, ...rest]));
    for (const arrangement of permutations(pins)) expect(summary(paintOrder(arrangement))).toEqual(expected);
  });

  it('leaves its input untouched', () => {
    const pins = pinsWithCounts([[10, 3], [20, 1]]);
    const before = summary(pins);
    paintOrder(pins);
    expect(summary(pins)).toEqual(before);
  });

  it('rejects two pins with the same id', () => {
    const [pin] = pinsWithCounts([[10, 2]]);
    if (pin === undefined) throw new Error('no pin');
    expect(() => compareByProminence(pin, { ...pin })).toThrow(/share the id/);
  });
});

describe('placeLabels', () => {
  const viewport = { width: 400, height: 200 };
  const label = (id: string, x: number, y: number) => ({ id, text: id, x, y, width: 60, height: 14, pinRadius: 6 });

  it('places non-overlapping labels to the right', () => {
    const placed = placeLabels([label('a', 50, 50), label('b', 50, 120)], [], viewport);
    expect(placed.map((item) => [item.id, item.anchor])).toEqual([['a', 'start'], ['b', 'start']]);
  });

  it('falls back to the left and drops labels that cannot fit', () => {
    const placed = placeLabels([label('a', 100, 50), label('b', 110, 52), label('c', 105, 51)], [], viewport);
    expect(placed.map((item) => [item.id, item.anchor])).toEqual([['a', 'start'], ['b', 'end']]);
  });

  it('avoids other pins and the viewport edge', () => {
    const placed = placeLabels([label('a', 380, 50)], [{ id: 'other', x: 340, y: 50, radius: 6 }], viewport);
    expect(placed).toEqual([]);
  });
});
