import { describe, expect, it } from 'vitest';
import { parseIsoDate } from '../../src/data/dates.ts';
import { defaultPreset, isPresetAvailable, presetRange } from '../../src/view/timePresets.ts';
import { DAY_MS } from '../../src/view/timeScale.ts';

const day = (iso: string) => parseIsoDate(iso).getTime();
const today = day('2026-10-16');
const shows = [
  { start: day('2026-03-06'), end: day('2026-03-06') },
  { start: day('2026-11-02'), end: day('2026-11-02') },
  { start: day('2027-06-18'), end: day('2027-06-20') },
];

describe('time presets', () => {
  it('upcoming runs from just before today to the last show', () => {
    const range = presetRange('upcoming', shows, today);
    expect(range?.[0]).toBe(today - 3 * DAY_MS);
    expect(range?.[1]).toBeGreaterThan(day('2027-06-21'));
    expect(range?.[1]).toBeLessThan(day('2027-07-10'));
  });

  it('past runs from the first show to just after today', () => {
    const range = presetRange('past', shows, today);
    expect(range?.[0]).toBeLessThan(day('2026-03-06'));
    expect(range?.[1]).toBe(today + 3 * DAY_MS);
  });

  it('next 3 months is a fixed window and all means fit everything', () => {
    expect(presetRange('next-3-months', shows, today)).toEqual([today - 3 * DAY_MS, today + 92 * DAY_MS]);
    expect(presetRange('all', shows, today)).toBeNull();
  });

  it('knows which presets have shows to show', () => {
    const history = [{ start: day('2026-03-06'), end: day('2026-03-06') }];
    expect(isPresetAvailable('upcoming', history, today)).toBe(false);
    expect(isPresetAvailable('next-3-months', [{ start: day('2027-06-18'), end: day('2027-06-20') }], today)).toBe(false);
    expect(defaultPreset(history, today)).toBe('all');
    expect(defaultPreset(shows, today)).toBe('upcoming');
    expect(() => presetRange('upcoming', history, today)).toThrow(RangeError);
  });

  it('counts a festival that is still running as upcoming', () => {
    const running = [{ start: day('2026-10-14'), end: day('2026-10-17') }];
    expect(isPresetAvailable('upcoming', running, today)).toBe(true);
  });
});
