import { de } from './de.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import { fr } from './fr.ts';
import { AUTOMATIC, resolveLocale, type Language, type LocaleChoice, type ResolvedLocale } from './locale.ts';
import type { Messages } from './messages.ts';

const CATALOGS: Readonly<Record<Language, Messages>> = { en, de, fr, es };

/** Date, time and name formats of the active locale. Band dates are calendar days, so everything formats in UTC. */
export interface Formats {
  /** 17 Oct 2026 / Oct 17, 2026 / 17. Okt. 2026 */
  readonly date: Intl.DateTimeFormat;
  readonly weekday: Intl.DateTimeFormat;
  /** Month headings of a show list: October 2026 */
  readonly month: Intl.DateTimeFormat;
  /** A start time; follows the 12/24-hour choice. */
  readonly time: Intl.DateTimeFormat;
  readonly axisDay: Intl.DateTimeFormat;
  readonly axisDayMonth: Intl.DateTimeFormat;
  readonly axisMonth: Intl.DateTimeFormat;
  readonly axisMonthYear: Intl.DateTimeFormat;
  readonly axisYear: Intl.DateTimeFormat;
  readonly list: Intl.ListFormat;
  /** Countries by ISO code and world regions by UN M49 code. */
  readonly regions: Intl.DisplayNames;
}

interface Active {
  readonly choice: LocaleChoice;
  readonly locale: ResolvedLocale;
  readonly messages: Messages;
  readonly formats: Formats;
}

let active: Active = activate(AUTOMATIC, resolveLocale(AUTOMATIC, ['en-US']));

/** Called once at start-up, before anything renders; changing the language reloads the page. */
export function useLocale(choice: LocaleChoice, browserLanguages: readonly string[]): void {
  active = activate(choice, resolveLocale(choice, browserLanguages));
}

export const t = (): Messages => active.messages;
export const formats = (): Formats => active.formats;
export const currentLocale = (): ResolvedLocale => active.locale;
export const localeChoice = (): LocaleChoice => active.choice;

function activate(choice: LocaleChoice, locale: ResolvedLocale): Active {
  const tag = locale.tag;
  const utc = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { ...options, timeZone: 'UTC' });
  return {
    choice,
    locale,
    messages: CATALOGS[locale.language],
    formats: {
      date: utc({ day: 'numeric', month: 'short', year: 'numeric' }),
      weekday: utc({ weekday: 'short' }),
      month: utc({ month: 'long', year: 'numeric' }),
      time: utc({ hour: 'numeric', minute: '2-digit', ...(locale.hourCycle === undefined ? {} : { hourCycle: locale.hourCycle }) }),
      axisDay: utc({ weekday: 'short', day: 'numeric' }),
      axisDayMonth: utc({ day: 'numeric', month: 'short' }),
      axisMonth: utc({ month: 'short' }),
      axisMonthYear: utc({ month: 'short', year: 'numeric' }),
      axisYear: utc({ year: 'numeric' }),
      list: new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' }),
      regions: new Intl.DisplayNames([tag], { type: 'region' }),
    },
  };
}
