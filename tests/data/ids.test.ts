import { describe, expect, it } from 'vitest';
import { IdError, assignShowIds, baseShowId, isShowIdFormat, slugify } from '../../src/data/ids.ts';
import { makeDraftShow } from '../helpers.ts';

describe('slugify', () => {
  it.each([
    ['São Paulo', 'sao-paulo'],
    ['Montréal', 'montreal'],
    ['Québec', 'quebec'],
    ['Kraków', 'krakow'],
    ['Łódź', 'lodz'],
    ['Reykjavík', 'reykjavik'],
    ['Düsseldorf', 'dusseldorf'],
    ['Malmö', 'malmo'],
    ['Ærøskøbing', 'aeroskobing'],
    ['Gießen', 'giessen'],
    ['Ciudad de México', 'ciudad-de-mexico'],
    ['St. Pölten', 'st-polten'],
    ["L'Aquila", 'l-aquila'],
    ['  New   York  ', 'new-york'],
    ['Rīga', 'riga'],
    ['Þórshöfn', 'thorshofn'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('show ids', () => {
  it('builds band-date-city', () => {
    expect(baseShowId('glass-harbor', '2026-11-02', 'São Paulo')).toBe('glass-harbor-2026-11-02-sao-paulo');
  });

  it('refuses cities without Latin letters', () => {
    expect(() => baseShowId('glass-harbor', '2026-11-02', '東京')).toThrow(IdError);
  });

  it('recognises the id format', () => {
    expect(isShowIdFormat('glass-harbor-2026-11-02-sao-paulo', 'glass-harbor')).toBe(true);
    expect(isShowIdFormat('glass-harbor-2026-11-02-berlin-2', 'glass-harbor')).toBe(true);
    expect(isShowIdFormat('other-band-2026-11-02-berlin', 'glass-harbor')).toBe(false);
    expect(isShowIdFormat('glass-harbor-berlin', 'glass-harbor')).toBe(false);
  });

  it('keeps existing ids and numbers same-day shows in the same city', () => {
    const shows = [
      makeDraftShow({ city: 'Reykjavík', date: '2026-12-05', startTime: '20:00' }),
      makeDraftShow({ city: 'Reykjavík', date: '2026-12-05', startTime: '15:00' }),
      makeDraftShow({ city: 'Berlin', id: 'band-2026-11-02-berlin' }),
    ];
    expect(assignShowIds('band', shows).map((show) => show.id)).toEqual([
      'band-2026-12-05-reykjavik-2',
      'band-2026-12-05-reykjavik',
      'band-2026-11-02-berlin',
    ]);
  });

  it('does not collide with an existing id', () => {
    const shows = [makeDraftShow({ city: 'Berlin' }), makeDraftShow({ city: 'Berlin', id: 'band-2026-11-02-berlin' })];
    expect(assignShowIds('band', shows).map((show) => show.id)).toEqual(['band-2026-11-02-berlin-2', 'band-2026-11-02-berlin']);
  });
});
