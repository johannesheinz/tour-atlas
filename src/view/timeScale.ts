import { utcDay, utcMonday, utcMonth, utcYear, type TimeInterval } from 'd3-time';
import { utcFormat } from 'd3-time-format';

export const DAY_MS = 86_400_000;

export type TickUnit = 'year' | 'quarter' | 'month' | 'week' | 'day';

export interface Tick {
  readonly time: number;
  readonly label: string;
  /** Ticks that start a larger period (a month among weeks, a year among months) get a stronger mark. */
  readonly major: boolean;
}

/** Date range of the shows, padded on both sides; a single day gets a minimum span around it. */
export function fitDateDomain(
  ranges: readonly { readonly start: number; readonly end: number }[],
  paddingFraction: number,
  minSpanDays: number,
): [number, number] {
  if (ranges.length === 0) throw new RangeError('fitDateDomain needs at least one show');
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const { start, end } of ranges) {
    first = Math.min(first, start);
    last = Math.max(last, end + DAY_MS);
  }
  const span = last - first;
  const minSpan = minSpanDays * DAY_MS;
  if (span < minSpan) {
    const center = (first + last) / 2;
    return [center - minSpan / 2, center + minSpan / 2];
  }
  const padding = span * paddingFraction;
  return [first - padding, last + padding];
}

const MIN_LABEL_SPACING_PX = { day: 34, week: 52, month: 44, quarter: 52, year: 44 } as const;
const APPROX_DAYS = { day: 1, week: 7, month: 30.44, quarter: 91.3, year: 365.25 } as const;
const UNITS_FINE_TO_COARSE: readonly TickUnit[] = ['day', 'week', 'month', 'quarter', 'year'];

/** Finest unit whose labels still fit: days, then weeks, then months (then quarters and years). */
export function chooseTickUnit(domain: readonly [number, number], widthPx: number): TickUnit {
  const pxPerDay = widthPx / Math.max(1, (domain[1] - domain[0]) / DAY_MS);
  return UNITS_FINE_TO_COARSE.find((unit) => pxPerDay * APPROX_DAYS[unit] >= MIN_LABEL_SPACING_PX[unit]) ?? 'year';
}

const formatDay = utcFormat('%a %-d');
const formatWeek = utcFormat('%-d %b');
const formatMonth = utcFormat('%b');
const formatMonthYear = utcFormat('%b %Y');
const formatYear = utcFormat('%Y');

const quarter: TimeInterval = utcMonth.every(3) ?? utcMonth;

export function timeTicks(domain: readonly [number, number], widthPx: number): { unit: TickUnit; ticks: Tick[] } {
  const unit = chooseTickUnit(domain, widthPx);
  const start = new Date(domain[0]);
  const end = new Date(domain[1]);
  const isMonthStart = (date: Date) => date.getUTCDate() === 1;
  const isYearStart = (date: Date) => date.getUTCMonth() === 0 && isMonthStart(date);

  const build = (interval: TimeInterval, label: (date: Date, index: number) => string, major: (date: Date) => boolean) =>
    interval.range(start, end).map((date, index) => ({ time: date.getTime(), label: label(date, index), major: major(date) }));

  switch (unit) {
    case 'day':
      return { unit, ticks: build(utcDay, (date) => (isMonthStart(date) ? formatMonthYear(date) : formatDay(date)), isMonthStart) };
    case 'week':
      return { unit, ticks: build(utcMonday, formatWeek, (date) => date.getUTCDate() <= 7) };
    case 'month':
      return { unit, ticks: build(utcMonth, (date, index) => (isYearStart(date) || index === 0 ? formatMonthYear(date) : formatMonth(date)), isYearStart) };
    case 'quarter':
      return { unit, ticks: build(quarter, formatMonthYear, isYearStart) };
    case 'year':
      return { unit, ticks: build(utcYear, formatYear, () => true) };
  }
}
