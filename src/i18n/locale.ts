export type Language = 'en' | 'de' | 'fr' | 'es';
export type Clock = '12' | '24';

export const LANGUAGES: readonly Language[] = ['en', 'de', 'fr', 'es'];
export const CLOCKS: readonly Clock[] = ['12', '24'];

/** Each language in its own name, for the language menu. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = { en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español' };

/** Formats for a language when the browser names no region for it: US English (12-hour clock), and the language's home country. */
const DEFAULT_TAGS: Readonly<Record<Language, string>> = { en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };

/** What the viewer picked in the settings; null follows the browser. */
export interface LocaleChoice {
  readonly language: Language | null;
  readonly clock: Clock | null;
}

export interface ResolvedLocale {
  readonly language: Language;
  /** BCP 47 tag for Intl formats: the browser's own regional variant of the language when it has one. */
  readonly tag: string;
  /** Undefined keeps the region's habit (en-US 12-hour, en-GB 24-hour). */
  readonly hourCycle: 'h12' | 'h23' | undefined;
}

export const AUTOMATIC: LocaleChoice = { language: null, clock: null };

export function isLanguage(value: string): value is Language {
  return LANGUAGES.some((language) => language === value);
}

export function isClock(value: string): value is Clock {
  return CLOCKS.some((clock) => clock === value);
}

/** The first browser language the app speaks wins; English is the fallback. Formats follow the matching browser region. */
export function resolveLocale(choice: LocaleChoice, browserLanguages: readonly string[]): ResolvedLocale {
  const tags = browserLanguages.flatMap(canonical);
  const language = choice.language ?? tags.map(primaryLanguage).find(isLanguage) ?? 'en';
  const regional = tags.find((tag) => primaryLanguage(tag) === language && tag.includes('-'));
  return {
    language,
    tag: regional ?? DEFAULT_TAGS[language],
    hourCycle: choice.clock === '12' ? 'h12' : choice.clock === '24' ? 'h23' : undefined,
  };
}

function canonical(tag: string): string[] {
  try {
    return Intl.getCanonicalLocales(tag);
  } catch {
    return [];
  }
}

function primaryLanguage(tag: string): string {
  return tag.split('-')[0]?.toLowerCase() ?? '';
}
