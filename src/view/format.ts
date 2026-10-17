import { parseIsoDate } from '../data/dates.ts';

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function formatDate(isoDate: string): string {
  return dayFormat.format(parseIsoDate(isoDate));
}

export function formatWeekday(isoDate: string): string {
  return weekdayFormat.format(parseIsoDate(isoDate));
}

export function formatDateSpan(date: string, endDate: string | null): string {
  return endDate === null ? formatDate(date) : `${formatDate(date)} – ${formatDate(endDate)}`;
}

export function countryName(countryCode: string): string {
  return regionNames.of(countryCode) ?? countryCode;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export const STATUS_LABELS = {
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
  soldout: 'Sold out',
} as const;
