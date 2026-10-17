import { describe, expect, it } from 'vitest';
import type { BandFile } from '../../src/data/types.ts';
import { buildBandEntries } from '../../src/model.ts';
import { parseUrlState, serializeUrlState } from '../../src/urlState.ts';
import { buildSearchIndex, foldForSearch, searchEntries } from '../../src/view/searchIndex.ts';
import { readJson } from '../helpers.ts';

const files = ['samples/iron-lantern.json', 'samples/glass-harbor.json'].map((path) => readJson(path) as BandFile);
const index = buildSearchIndex(buildBandEntries(files, []), (code) => ({ BR: 'Brazil', NO: 'Norway' })[code] ?? code);

describe('search', () => {
  it('folds accents and case', () => {
    expect(foldForSearch('São Paulo')).toBe('sao paulo');
  });

  it('finds cities without accents', () => {
    const [first] = searchEntries(index, 'sao', 5);
    expect(first?.kind).toBe('place');
    expect(first?.label).toBe('São Paulo, Brazil');
    expect(first?.showIds).toEqual(['iron-lantern-2026-10-13-sao-paulo']);
  });

  it('finds bands, tours and festivals and groups them by kind', () => {
    const kinds = searchEntries(index, 'iron', 5).map((entry) => entry.kind);
    expect(kinds[0]).toBe('band');
    expect(searchEntries(index, 'hollow tides', 5).map((entry) => [entry.kind, entry.detail])).toEqual([['tour', 'Glass Harbor, 17 shows']]);
    expect(searchEntries(index, 'fjord', 5).map((entry) => [entry.kind, entry.label, entry.detail])).toEqual([
      ['event', 'Fjordstorm Festival', 'Bergen, Norway'],
    ]);
  });

  it('ranks prefix matches first and limits each kind', () => {
    const results = searchEntries(index, 'b', 2);
    expect(results.filter((entry) => entry.kind === 'place').map((entry) => entry.label)).toEqual(['Barcelona, ES', 'Belo Horizonte, Brazil']);
  });

  it('returns nothing for an empty query', () => {
    expect(searchEntries(index, '  ', 5)).toEqual([]);
  });
});

describe('url state', () => {
  it('round-trips', () => {
    const state = {
      hiddenBandIds: ['velvet-meridian', 'glass-harbor'],
      tags: ['doom-metal'],
      sort: 'next-show' as const,
      from: '2026-10-01',
      to: '2026-12-31',
      selectedShowIds: ['iron-lantern-2026-10-17-belo-horizonte'],
      follow: false,
      preset: null,
      allLanes: true,
      includePastMonth: true,
      region: 'europe',
      globe: true,
    };
    const hash = serializeUrlState(state);
    expect(hash).toBe('#hide=glass-harbor,velvet-meridian&tags=doom-metal&sort=next-show&from=2026-10-01&to=2026-12-31&show=iron-lantern-2026-10-17-belo-horizonte&follow=0&lanes=all&recent=1&view=europe&globe=1');
    expect(parseUrlState(hash)).toEqual({ ...state, hiddenBandIds: ['glass-harbor', 'velvet-meridian'] });
  });

  it('ignores malformed values', () => {
    expect(parseUrlState('#hide=ok,Not%20Ok&sort=random&from=2026-02-30&to=2026-03-01&follow=maybe')).toEqual({
      hiddenBandIds: ['ok'],
      tags: [],
      sort: null,
      from: null,
      to: null,
      selectedShowIds: [],
      follow: null,
      preset: null,
      allLanes: false,
      includePastMonth: false,
      region: null,
      globe: false,
    });
  });

  it('keeps a time preset', () => {
    expect(parseUrlState('#when=past').preset).toBe('past');
    expect(parseUrlState('#when=someday').preset).toBeNull();
  });

  it('serializes the default view to an empty hash', () => {
    expect(serializeUrlState({ hiddenBandIds: [], tags: [], sort: null, from: null, to: null, selectedShowIds: [], follow: null, preset: null, allLanes: false, includePastMonth: false, region: null, globe: false })).toBe('');
  });
});
