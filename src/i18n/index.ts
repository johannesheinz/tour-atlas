import { de } from './de.ts';
import { en } from './en.ts';
import { eo, eoFormatWords } from './eo.ts';
import { es } from './es.ts';
import { fi } from './fi.ts';
import { intlFormats, ownWordFormats, type Formats } from './formats.ts';
import { fr } from './fr.ts';
import { la, laFormatWords } from './la.ts';
import { AUTOMATIC, resolveLocale, type Language, type LocaleChoice, type ResolvedLocale } from './locale.ts';
import type { Messages } from './messages.ts';
import { sv } from './sv.ts';

interface Catalog {
  readonly messages: Messages;
  readonly formats: (locale: ResolvedLocale) => Formats;
}

/** Browsers have no Latin or Esperanto data, so those two bring their own calendar words and country names. */
const CATALOGS: Readonly<Record<Language, Catalog>> = {
  en: { messages: en, formats: intlFormats },
  de: { messages: de, formats: intlFormats },
  fr: { messages: fr, formats: intlFormats },
  es: { messages: es, formats: intlFormats },
  sv: { messages: sv, formats: intlFormats },
  fi: { messages: fi, formats: intlFormats },
  la: { messages: la, formats: (locale) => ownWordFormats(locale, laFormatWords) },
  eo: { messages: eo, formats: (locale) => ownWordFormats(locale, eoFormatWords) },
};

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
  const catalog = CATALOGS[locale.language];
  return { choice, locale, messages: catalog.messages, formats: catalog.formats(locale) };
}
