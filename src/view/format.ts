import { parseIsoDate } from '../data/dates.ts';
import { formats, t } from '../i18n/index.ts';
import type { StatusKind } from '../i18n/messages.ts';
import type { ShowRef } from '../model.ts';
import type { LonLat } from './geoFit.ts';

export function formatDate(isoDate: string): string {
  return formats().date.format(parseIsoDate(isoDate));
}

export function formatWeekday(isoDate: string): string {
  return formats().weekday.format(parseIsoDate(isoDate));
}

/** One date, or a range the locale shortens where it can: "2–5 Nov 2026". */
export function formatDateSpan(date: string, endDate: string | null): string {
  return endDate === null ? formatDate(date) : formats().date.formatRange(parseIsoDate(date), parseIsoDate(endDate));
}

/** A show's "HH:MM" start time on the viewer's 12- or 24-hour clock. */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined) throw new Error(`start time ${time} is not HH:MM`);
  return formats().time.format(Date.UTC(1970, 0, 1, hours, minutes));
}

export function countryName(countryCode: string): string {
  return formats().regions.of(countryCode) ?? countryCode;
}

/** "60.17° N, 24.94° E" with the language's compass letters and decimal mark. */
export function formatCoordinates([lon, lat]: LonLat): string {
  const { compass, coordinates } = t().map;
  const degrees = formats().degrees;
  return coordinates(`${degrees(Math.abs(lat))}\u00a0${lat < 0 ? compass.south : compass.north}`, `${degrees(Math.abs(lon))}\u00a0${lon < 0 ? compass.west : compass.east}`);
}

export function formatList(items: readonly string[]): string {
  return formats().list.format(items);
}

/** "played" for past shows that took place; otherwise the stated status, or null when unknown. */
export function statusKind(ref: ShowRef): StatusKind | null {
  const { status } = ref.show;
  if (ref.isPast && status !== 'cancelled' && status !== 'postponed') return 'played';
  return status;
}

export function statusLabel(ref: ShowRef): string | null {
  const kind = statusKind(ref);
  return kind === null ? null : t().status[kind];
}
