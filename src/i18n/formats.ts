import { isCountryCode, type CountryCode } from '../data/countries.ts';
import type { HourCycle, ResolvedLocale } from './locale.ts';

export interface DateFormat {
  format(date: Date | number): string;
}

export interface DateRangeFormat extends DateFormat {
  formatRange(start: Date, end: Date): string;
}

export interface ListFormat {
  format(items: readonly string[]): string;
}

export interface RegionNames {
  /** Undefined for a code the language has no name for. */
  of(countryCode: string): string | undefined;
}

/** Date, time and name formats of the active locale. Band dates are calendar days, so everything formats in UTC. */
export interface Formats {
  /** 17 Oct 2026 / Oct 17, 2026 / 17. Okt. 2026 */
  readonly date: DateRangeFormat;
  readonly weekday: DateFormat;
  /** Month headings of a show list: October 2026 */
  readonly month: DateFormat;
  /** A start time; follows the 12/24-hour choice. */
  readonly time: DateFormat;
  /** A start time on the given clock, for the settings' preview of each choice; undefined keeps the region's habit. */
  readonly timeOnClock: (hourCycle: HourCycle | undefined) => DateFormat;
  readonly axisDay: DateFormat;
  readonly axisDayMonth: DateFormat;
  readonly axisMonth: DateFormat;
  readonly axisMonthYear: DateFormat;
  readonly axisYear: DateFormat;
  readonly list: ListFormat;
  /** Country names by ISO code. */
  readonly regions: RegionNames;
}

type Months = readonly [string, string, string, string, string, string, string, string, string, string, string, string];
type Weekdays = readonly [string, string, string, string, string, string, string];

/** What browsers lack for Latin and Esperanto: Intl quietly formats those in the browser's default language instead. */
export interface FormatWords {
  /** January first; standalone, for headings like "October 2026". */
  readonly monthsLong: Months;
  /** January first; next to a day ("17 Oct 2026") or alone on the timeline axis. */
  readonly monthsShort: Months;
  /** Sunday first, as Date.getUTCDay() counts. */
  readonly weekdaysShort: Weekdays;
  /** The marks of the 12-hour clock. */
  readonly dayPeriods: { readonly am: string; readonly pm: string };
  /** Joins the last item of a list: "a, b et c". */
  readonly listConjunction: string;
  readonly countryNames: Readonly<Record<CountryCode, string>>;
}

/** The only options the formats use, so own words exist for every month and weekday width asked for. */
interface DateOptions {
  readonly day?: 'numeric';
  readonly month?: 'short' | 'long';
  readonly weekday?: 'short';
  readonly year?: 'numeric';
  readonly hour?: 'numeric';
  readonly minute?: '2-digit';
  readonly hourCycle?: HourCycle;
}

export function intlFormats(locale: ResolvedLocale): Formats {
  return buildFormats(
    locale.hourCycle,
    (options) => new Intl.DateTimeFormat(locale.tag, { ...options, timeZone: 'UTC' }),
    new Intl.ListFormat(locale.tag, { style: 'long', type: 'conjunction' }),
    new Intl.DisplayNames([locale.tag], { type: 'region' }),
  );
}

/** Every browser knows it: day before month, and a 24-hour clock unless the viewer picks 12. */
const SHAPE_LOCALE = 'en-GB';

/** Formats in en-GB's shape with the language's own words, the same in every browser. */
export function ownWordFormats(locale: ResolvedLocale, words: FormatWords): Formats {
  return buildFormats(
    locale.hourCycle,
    (options) => withOwnWords(new Intl.DateTimeFormat(SHAPE_LOCALE, { ...options, timeZone: 'UTC' }), options, words),
    conjunctionList(words.listConjunction),
    { of: (countryCode) => (isCountryCode(countryCode) ? words.countryNames[countryCode] : undefined) },
  );
}

function buildFormats(hourCycle: HourCycle | undefined, dateFormat: (options: DateOptions) => DateRangeFormat, list: ListFormat, regions: RegionNames): Formats {
  const timeOnClock = (clock: HourCycle | undefined) => dateFormat({ hour: 'numeric', minute: '2-digit', ...(clock === undefined ? {} : { hourCycle: clock }) });
  return {
    date: dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }),
    weekday: dateFormat({ weekday: 'short' }),
    month: dateFormat({ month: 'long', year: 'numeric' }),
    time: timeOnClock(hourCycle),
    timeOnClock,
    axisDay: dateFormat({ weekday: 'short', day: 'numeric' }),
    axisDayMonth: dateFormat({ day: 'numeric', month: 'short' }),
    axisMonth: dateFormat({ month: 'short' }),
    axisMonthYear: dateFormat({ month: 'short', year: 'numeric' }),
    axisYear: dateFormat({ year: 'numeric' }),
    list,
    regions,
  };
}

function withOwnWords(shape: Intl.DateTimeFormat, options: DateOptions, words: FormatWords): DateRangeFormat {
  const months = options.month === 'long' ? words.monthsLong : words.monthsShort;
  const word = (part: Intl.DateTimeFormatPart, date: Date): string => {
    switch (part.type) {
      case 'month':
        return nameAt(months, date.getUTCMonth());
      case 'weekday':
        return nameAt(words.weekdaysShort, date.getUTCDay());
      case 'dayPeriod':
        return date.getUTCHours() < 12 ? words.dayPeriods.am : words.dayPeriods.pm;
      default:
        return part.value;
    }
  };
  return {
    format(date) {
      const day = new Date(date);
      return shape
        .formatToParts(day)
        .map((part) => word(part, day))
        .join('');
    },
    formatRange(start, end) {
      return shape
        .formatRangeToParts(start, end)
        .map((part) => word(part, part.source === 'endRange' ? end : start))
        .join('');
    },
  };
}

function nameAt(names: readonly string[], index: number): string {
  const name = names[index];
  if (name === undefined) throw new Error(`no name at index ${index}`);
  return name;
}

function conjunctionList(conjunction: string): ListFormat {
  return {
    format(items) {
      const last = items.at(-1);
      if (last === undefined) return '';
      const head = items.slice(0, -1);
      return head.length === 0 ? last : `${head.join(', ')} ${conjunction} ${last}`;
    },
  };
}
