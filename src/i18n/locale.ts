export type Language = 'en' | 'de' | 'fr' | 'es' | 'sv' | 'fi' | 'la' | 'eo';
export type Clock = '12' | '24';
export type HourCycle = 'h12' | 'h23';
/** Kilometres, statute miles, or the Swedish mil of 10 km. */
export type DistanceUnit = 'km' | 'mi' | 'mil';

export const LANGUAGES: readonly Language[] = ['en', 'de', 'fr', 'es', 'sv', 'fi', 'la', 'eo'];
export const CLOCKS: readonly Clock[] = ['12', '24'];
export const DISTANCE_UNITS: readonly DistanceUnit[] = ['km', 'mi', 'mil'];

/** Each language in its own name, for the language menu. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  sv: 'Svenska',
  fi: 'Suomi',
  la: 'Latina',
  eo: 'Esperanto',
};

/** Formats for a language when the browser names no region for it: US English (12-hour clock), the language's home country, or none for Latin and Esperanto. */
const DEFAULT_TAGS: Readonly<Record<Language, string>> = { en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', sv: 'sv-SE', fi: 'fi-FI', la: 'la', eo: 'eo' };

/** What the viewer picked in the settings; null follows the browser. */
export interface LocaleChoice {
  readonly language: Language | null;
  readonly clock: Clock | null;
  readonly distance: DistanceUnit | null;
}

export interface ResolvedLocale {
  readonly language: Language;
  /** BCP 47 tag for the page's lang and the Intl formats: the browser's own regional variant of the language when it has one. */
  readonly tag: string;
  /** Undefined keeps the region's habit (en-US 12-hour, en-GB 24-hour). */
  readonly hourCycle: HourCycle | undefined;
  readonly distance: DistanceUnit;
}

export const AUTOMATIC: LocaleChoice = { language: null, clock: null, distance: null };

export function isLanguage(value: string): value is Language {
  return LANGUAGES.some((language) => language === value);
}

export function isClock(value: string): value is Clock {
  return CLOCKS.some((clock) => clock === value);
}

export function isDistanceUnit(value: string): value is DistanceUnit {
  return DISTANCE_UNITS.some((unit) => unit === value);
}

/** The first browser language the app speaks wins; English is the fallback. Formats follow the matching browser region. */
export function resolveLocale(choice: LocaleChoice, browserLanguages: readonly string[]): ResolvedLocale {
  const tags = browserLanguages.flatMap(canonical);
  const language = choice.language ?? tags.map(primaryLanguage).find(isLanguage) ?? 'en';
  const regional = tags.find((tag) => primaryLanguage(tag) === language && tag.includes('-'));
  const tag = regional ?? DEFAULT_TAGS[language];
  return {
    language,
    tag,
    hourCycle: choice.clock === '12' ? 'h12' : choice.clock === '24' ? 'h23' : undefined,
    distance: choice.distance ?? habitualDistance(language, tag),
  };
}

/** Swedish speakers count road distances in mil, the US in miles, everyone else in kilometres. */
function habitualDistance(language: Language, tag: string): DistanceUnit {
  if (language === 'sv') return 'mil';
  return new Intl.Locale(tag).region === 'US' ? 'mi' : 'km';
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
