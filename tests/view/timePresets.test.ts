import { describe, expect, it } from 'vitest';
import { parseIsoDate } from '../../src/data/dates.ts';
import { defaultPreset, isPresetAvailable, presetWindow, usesPastMonth, windowAfterFilterChange } from '../../src/view/timePresets.ts';
import { DAY_MS } from '../../src/view/timeScale.ts';

const day = (iso: string) => parseIsoDate(iso).getTime();
const today = day('2026-10-16');
const shows = [
  { start: day('2026-03-06'), end: day('2026-03-06') },
  { start: day('2026-10-01'), end: day('2026-10-01') },
  { start: day('2026-11-02'), end: day('2026-11-02') },
  { start: day('2027-06-18'), end: day('2027-06-20') },
];

describe('time presets', () => {
  it('all upcoming runs from today to the last show', () => {
    const range = presetWindow('upcoming', shows, today, false);
    expect(range?.[0]).toBe(today);
    expect(range?.[1]).toBeGreaterThan(day('2027-06-21'));
    expect(range?.[1]).toBeLessThan(day('2027-07-10'));
  });

  it('fixed windows look 3, 6 and 12 months ahead', () => {
    expect(presetWindow('next-3-months', shows, today, false)).toEqual([today, today + 92 * DAY_MS]);
    expect(presetWindow('next-6-months', shows, today, false)?.[1]).toBe(today + 183 * DAY_MS);
    expect(presetWindow('next-12-months', shows, today, false)?.[1]).toBe(today + 365 * DAY_MS);
  });

  it('including the last month moves the start of forward presets back by a month', () => {
    expect(presetWindow('next-3-months', shows, today, true)?.[0]).toBe(today - 31 * DAY_MS);
    expect(presetWindow('upcoming', shows, today, true)?.[0]).toBe(today - 31 * DAY_MS);
    expect(usesPastMonth('past')).toBe(false);
    expect(usesPastMonth('all')).toBe(false);
  });

  it('past runs from the first show to just after today; all fits everything', () => {
    const range = presetWindow('past', shows, today, false);
    expect(range?.[0]).toBeLessThan(day('2026-03-06'));
    expect(range?.[1]).toBe(today + 3 * DAY_MS);
    expect(presetWindow('all', shows, today, false)).toBeNull();
  });

  it('knows which presets have shows to show', () => {
    const history = [{ start: day('2026-03-06'), end: day('2026-03-06') }];
    expect(isPresetAvailable('upcoming', history, today, false)).toBe(false);
    expect(isPresetAvailable('next-3-months', [{ start: day('2027-06-18'), end: day('2027-06-20') }], today, false)).toBe(false);
    expect(isPresetAvailable('next-12-months', [{ start: day('2027-06-18'), end: day('2027-06-20') }], today, false)).toBe(true);
    expect(isPresetAvailable('next-3-months', [{ start: day('2026-10-01'), end: day('2026-10-01') }], today, true)).toBe(true);
    expect(defaultPreset(history, today)).toBe('all');
    expect(defaultPreset(shows, today)).toBe('next-6-months');
    expect(defaultPreset([{ start: day('2027-06-18'), end: day('2027-06-20') }], today)).toBe('upcoming');
  });

  it('applies to shows that leave a preset empty: fixed windows stay, open-ended ones show two weeks next to today', () => {
    expect(presetWindow('next-3-months', [], today, false)).toEqual([today, today + 92 * DAY_MS]);
    const history = [{ start: day('2026-03-06'), end: day('2026-03-06') }];
    expect(presetWindow('upcoming', history, today, false)).toEqual([today, today + 14 * DAY_MS]);
    expect(presetWindow('upcoming', [], today, true)).toEqual([today - 31 * DAY_MS, today - 17 * DAY_MS]);
    expect(presetWindow('past', [{ start: day('2027-06-18'), end: day('2027-06-20') }], today, false)).toEqual([today - 11 * DAY_MS, today + 3 * DAY_MS]);
    expect(presetWindow('all', [], today, false)).toBeNull();
  });

  it('works a preset out again after a filter change and keeps a custom range', () => {
    const later = [{ start: day('2027-01-10'), end: day('2027-01-10') }];
    expect(windowAfterFilterChange('upcoming', null, later, today, false)).toEqual(presetWindow('upcoming', later, today, false));
    expect(windowAfterFilterChange('upcoming', { start: 1, end: 2 }, shows, today, false)).toEqual(presetWindow('upcoming', shows, today, false));
    expect(windowAfterFilterChange('all', { start: 1, end: 2 }, shows, today, false)).toBeNull();
    const custom = { start: day('2026-12-01'), end: day('2027-02-01') };
    expect(windowAfterFilterChange(null, custom, later, today, false)).toEqual([custom.start, custom.end]);
    expect(windowAfterFilterChange(null, custom, [], today, true)).toEqual([custom.start, custom.end]);
    expect(() => windowAfterFilterChange(null, null, shows, today, false)).toThrow(RangeError);
  });
});
