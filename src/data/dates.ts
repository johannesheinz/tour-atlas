const MS_PER_DAY = 86_400_000;

export function isCalendarDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Parses YYYY-MM-DD as a UTC day (no timezone drift between viewers). */
export function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined || !isCalendarDate(isoDate)) {
    throw new RangeError(`"${isoDate}" is not a YYYY-MM-DD calendar date`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  return Math.round((parseIsoDate(toIsoDate).getTime() - parseIsoDate(fromIsoDate).getTime()) / MS_PER_DAY);
}

export function addDays(isoDate: string, days: number): string {
  return formatIsoDate(new Date(parseIsoDate(isoDate).getTime() + days * MS_PER_DAY));
}

/** The viewer's local calendar day as YYYY-MM-DD. */
export function localToday(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
