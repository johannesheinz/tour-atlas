import { describe, expect, it } from 'vitest';
import { parseIsoDate } from '../../src/data/dates.ts';
import { DAY_MS, chooseTickUnit, fitDateDomain, timeTicks } from '../../src/view/timeScale.ts';

const day = (iso: string) => parseIsoDate(iso).getTime();
const range = (start: string, end = start) => ({ start: day(start), end: day(end) });

describe('fitDateDomain', () => {
  it('pads the date range by 3% on both sides', () => {
    const [start, end] = fitDateDomain([range('2026-01-01'), range('2026-04-10')], 0.03, 14);
    const span = day('2026-04-11') - day('2026-01-01');
    expect(start).toBeCloseTo(day('2026-01-01') - span * 0.03);
    expect(end).toBeCloseTo(day('2026-04-11') + span * 0.03);
  });

  it('includes multi-day events up to their last day', () => {
    const [, end] = fitDateDomain([range('2026-01-01'), range('2026-06-18', '2026-06-20')], 0, 14);
    expect(end).toBe(day('2026-06-21'));
  });

  it('gives a single show a minimum span centred on it', () => {
    const [start, end] = fitDateDomain([range('2026-12-02')], 0.03, 14);
    expect(end - start).toBe(14 * DAY_MS);
    expect((start + end) / 2).toBe(day('2026-12-02') + DAY_MS / 2);
  });

  it('refuses an empty list', () => {
    expect(() => fitDateDomain([], 0.03, 14)).toThrow(RangeError);
  });
});

describe('ticks', () => {
  const domain = (days: number): [number, number] => [day('2026-01-01'), day('2026-01-01') + days * DAY_MS];

  it('moves from months to weeks to days as the window narrows', () => {
    expect(chooseTickUnit(domain(365), 1000)).toBe('month');
    expect(chooseTickUnit(domain(90), 1000)).toBe('week');
    expect(chooseTickUnit(domain(20), 1000)).toBe('day');
  });

  it('falls back to quarters and years for long spans', () => {
    expect(chooseTickUnit(domain(1500), 1000)).toBe('quarter');
    expect(chooseTickUnit(domain(5000), 600)).toBe('year');
  });

  it('labels month ticks and marks the start of a year as major', () => {
    const { unit, ticks } = timeTicks([day('2026-11-01'), day('2027-03-01')], 1200);
    expect(unit).toBe('week');
    const months = timeTicks([day('2026-10-15'), day('2027-10-15')], 1000);
    expect(months.unit).toBe('month');
    expect(months.ticks.map((tick) => tick.label).slice(0, 4)).toEqual(['Nov 2026', 'Dec', 'Jan 2027', 'Feb']);
    expect(months.ticks.find((tick) => tick.label === 'Jan 2027')?.major).toBe(true);
    expect(ticks.length).toBeGreaterThan(10);
  });

  it('labels days with weekday and number', () => {
    const { unit, ticks } = timeTicks([day('2026-12-01'), day('2026-12-08')], 1000);
    expect(unit).toBe('day');
    expect(ticks.map((tick) => tick.label)).toEqual(['Dec 2026', 'Wed 2', 'Thu 3', 'Fri 4', 'Sat 5', 'Sun 6', 'Mon 7']);
  });
});
