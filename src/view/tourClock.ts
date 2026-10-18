import { DAY_MS } from './timeScale.ts';

export const TOUR_CLOCK_SETTINGS = {
  /** Breaks between shows count as at most this long, so a gap of months does not stall the animation. */
  maxGapDays: 14,
  msPerDay: 55,
  minDurationMs: 4000,
  maxDurationMs: 10_000,
} as const;

/** Calendar time of a tour mapped onto animation time: busy weeks move fast, long breaks are shortened. */
export interface TourClock {
  readonly durationMs: number;
  /** Animation time at which a date is reached. */
  at(date: number): number;
  /** The date shown at an animation time, for the timeline's playhead. */
  dateAt(ms: number): number;
}

export function createTourClock(dates: readonly number[]): TourClock | null {
  const days = [...new Set(dates)].toSorted((a, b) => a - b);
  const [first] = days;
  if (first === undefined || days.length < 2) return null;
  const maxGap = TOUR_CLOCK_SETTINGS.maxGapDays * DAY_MS;
  const compressed = [0];
  for (let index = 1; index < days.length; index++) {
    compressed.push((compressed[index - 1] ?? 0) + Math.min(maxGap, (days[index] ?? 0) - (days[index - 1] ?? 0)));
  }
  const total = compressed.at(-1) ?? 0;
  const durationMs = Math.min(TOUR_CLOCK_SETTINGS.maxDurationMs, Math.max(TOUR_CLOCK_SETTINGS.minDurationMs, (total / DAY_MS) * TOUR_CLOCK_SETTINGS.msPerDay));
  const scale = total === 0 ? 0 : durationMs / total;

  const at = (date: number): number => {
    if (date <= first) return 0;
    const next = days.findIndex((day) => day >= date);
    if (next === -1) return durationMs;
    const before = days[next - 1] ?? first;
    const after = days[next] ?? before;
    const span = Math.min(maxGap, after - before);
    const into = after === before ? 0 : ((date - before) / (after - before)) * span;
    return ((compressed[next - 1] ?? 0) + into) * scale;
  };

  const dateAt = (ms: number): number => {
    if (ms <= 0) return first;
    const target = ms / scale;
    const next = compressed.findIndex((value) => value >= target);
    if (next <= 0) return days.at(-1) ?? first;
    const before = days[next - 1] ?? first;
    const after = days[next] ?? before;
    const span = (compressed[next] ?? 0) - (compressed[next - 1] ?? 0);
    return span === 0 ? after : before + ((target - (compressed[next - 1] ?? 0)) / span) * (after - before);
  };

  return { durationMs, at, dateAt };
}
