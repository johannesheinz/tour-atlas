import { describe, expect, it } from 'vitest';
import { parseIsoDate } from '../../src/data/dates.ts';
import { defaultPreset, isPresetAvailable, presetRange, usesPastMonth } from '../../src/view/timePresets.ts';
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
    const range = presetRange('upcoming', shows, today, false);
    expect(range?.[0]).toBe(today);
    expect(range?.[1]).toBeGreaterThan(day('2027-06-21'));
    expect(range?.[1]).toBeLessThan(day('2027-07-10'));
  });

  it('fixed windows look 3, 6 and 12 months ahead', () => {
    expect(presetRange('next-3-months', shows, today, false)).toEqual([today, today + 92 * DAY_MS]);
    expect(presetRange('next-6-months', shows, today, false)?.[1]).toBe(today + 183 * DAY_MS);
    expect(presetRange('next-12-months', shows, today, false)?.[1]).toBe(today + 365 * DAY_MS);
  });

  it('including the last month moves the start of forward presets back by a month', () => {
    expect(presetRange('next-3-months', shows, today, true)?.[0]).toBe(today - 31 * DAY_MS);
    expect(presetRange('upcoming', shows, today, true)?.[0]).toBe(today - 31 * DAY_MS);
    expect(usesPastMonth('past')).toBe(false);
    expect(usesPastMonth('all')).toBe(false);
  });

  it('past runs from the first show to just after today; all fits everything', () => {
    const range = presetRange('past', shows, today, false);
    expect(range?.[0]).toBeLessThan(day('2026-03-06'));
    expect(range?.[1]).toBe(today + 3 * DAY_MS);
    expect(presetRange('all', shows, today, false)).toBeNull();
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
    expect(() => presetRange('upcoming', history, today, false)).toThrow(RangeError);
  });
});
