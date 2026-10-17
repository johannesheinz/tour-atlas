import { describe, expect, it } from 'vitest';
import { diffBand, hasChanges } from '../../src/data/diff.ts';
import { makeFile, makeShow } from '../helpers.ts';

describe('diffBand', () => {
  const berlin = makeShow();
  const hamburg = makeShow({ id: 'test-band-2026-11-03-hamburg', date: '2026-11-03', city: 'Hamburg' });
  const paris = makeShow({ id: 'test-band-2026-11-05-paris', date: '2026-11-05', city: 'Paris', countryCode: 'FR' });

  it('treats every show of a new band as added', () => {
    const diff = diffBand(null, makeFile([berlin, hamburg]));
    expect(diff.isNewBand).toBe(true);
    expect(diff.added).toEqual([berlin, hamburg]);
    expect(hasChanges(diff)).toBe(true);
  });

  it('finds added, removed and changed shows by id', () => {
    const cancelled = { ...hamburg, status: 'cancelled' as const, geo: { ...hamburg.geo, precision: 'venue' as const } };
    const diff = diffBand(makeFile([berlin, hamburg]), makeFile([cancelled, paris]));
    expect(diff.added.map((show) => show.id)).toEqual([paris.id]);
    expect(diff.removed.map((show) => show.id)).toEqual([berlin.id]);
    expect(diff.changed).toEqual([{ id: hamburg.id, before: hamburg, after: cancelled, fields: ['status', 'geo'] }]);
    expect(diff.unchangedCount).toBe(0);
  });

  it('reports no changes for identical data', () => {
    const diff = diffBand(makeFile([berlin]), makeFile([{ ...berlin, geo: { ...berlin.geo } }]));
    expect(hasChanges(diff)).toBe(false);
    expect(diff.unchangedCount).toBe(1);
  });

  it('reports band field changes', () => {
    const renamed = { ...makeFile([berlin]), band: { id: 'test-band', name: 'Test Band II', color: '#123456', tags: ['doom-metal'] } };
    expect(diffBand(makeFile([berlin]), renamed).bandFields).toEqual(['name', 'color', 'tags']);
  });
});
