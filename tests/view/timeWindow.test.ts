import { describe, expect, it } from 'vitest';
import { sameWindow } from '../../src/appState.ts';
import { parseIsoDate } from '../../src/data/dates.ts';
import { DAY_MS, fitDateDomain, timelineDomain } from '../../src/view/timeScale.ts';

const day = (iso: string) => parseIsoDate(iso).getTime();

describe('sameWindow', () => {
  it('compares windows by their dates, not by identity', () => {
    expect(sameWindow({ start: day('2026-11-01'), end: day('2027-02-01') }, { start: day('2026-11-01'), end: day('2027-02-01') })).toBe(true);
    expect(sameWindow({ start: day('2026-11-01'), end: day('2027-02-01') }, { start: day('2026-11-01'), end: day('2027-02-02') })).toBe(false);
    expect(sameWindow({ start: day('2026-11-02'), end: day('2027-02-01') }, { start: day('2026-11-01'), end: day('2027-02-01') })).toBe(false);
  });

  it('treats no window as equal only to no window', () => {
    expect(sameWindow(null, null)).toBe(true);
    expect(sameWindow(null, { start: 0, end: DAY_MS })).toBe(false);
    expect(sameWindow({ start: 0, end: DAY_MS }, null)).toBe(false);
  });
});

describe('timelineDomain', () => {
  it('fits the shows like fitDateDomain', () => {
    const shows = [{ start: day('2026-11-01'), end: day('2026-11-01') }, { start: day('2027-03-10'), end: day('2027-03-12') }];
    expect(timelineDomain(shows, day('2026-10-19'), 0.03, 14)).toEqual(fitDateDomain(shows, 0.03, 14));
  });

  it('shows a month either side of today without shows', () => {
    const today = day('2026-10-19');
    expect(timelineDomain([], today, 0.03, 14)).toEqual([today - 30 * DAY_MS, today + 30 * DAY_MS]);
  });
});
