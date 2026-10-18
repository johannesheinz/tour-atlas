import { describe, expect, it } from 'vitest';
import { parseIsoDate } from '../../src/data/dates.ts';
import { TOUR_CLOCK_SETTINGS, createTourClock } from '../../src/view/tourClock.ts';

const day = (iso: string) => parseIsoDate(iso).getTime();

describe('createTourClock', () => {
  it('needs at least two different dates', () => {
    expect(createTourClock([])).toBeNull();
    expect(createTourClock([day('2026-11-02'), day('2026-11-02')])).toBeNull();
  });

  it('moves with the calendar but shortens long breaks', () => {
    const clock = createTourClock([day('2026-11-01'), day('2026-11-03'), day('2027-03-01'), day('2027-03-02')]);
    if (clock === null) throw new Error('expected a clock');
    const msPerCompressedDay = clock.durationMs / (2 + TOUR_CLOCK_SETTINGS.maxGapDays + 1);
    expect(clock.at(day('2026-11-01'))).toBe(0);
    expect(clock.at(day('2026-11-03'))).toBeCloseTo(2 * msPerCompressedDay, 5);
    expect(clock.at(day('2027-03-01'))).toBeCloseTo((2 + TOUR_CLOCK_SETTINGS.maxGapDays) * msPerCompressedDay, 5);
    expect(clock.at(day('2027-03-02'))).toBeCloseTo(clock.durationMs, 5);
  });

  it('keeps the whole tour between the shortest and longest duration', () => {
    const short = createTourClock([day('2026-11-01'), day('2026-11-02')]);
    const long = createTourClock(Array.from({ length: 200 }, (_, index) => day('2026-01-01') + index * 86_400_000 * 3));
    expect(short?.durationMs).toBe(TOUR_CLOCK_SETTINGS.minDurationMs);
    expect(long?.durationMs).toBe(TOUR_CLOCK_SETTINGS.maxDurationMs);
  });

  it('maps animation time back to the date for the timeline playhead', () => {
    const clock = createTourClock([day('2026-11-01'), day('2026-11-11'), day('2026-11-21')]);
    if (clock === null) throw new Error('expected a clock');
    for (const date of [day('2026-11-01'), day('2026-11-06'), day('2026-11-11'), day('2026-11-21')]) {
      expect(clock.dateAt(clock.at(date))).toBeCloseTo(date, -3);
    }
  });
});
