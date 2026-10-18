import { afterEach, describe, expect, it, vi } from 'vitest';
import { NUMERIC_BY_ALPHA2 } from '../../src/data/countries.ts';
import { issueText } from '../../src/data/issues.ts';
import { validateDraft } from '../../src/data/validate.ts';
import { de } from '../../src/i18n/de.ts';
import { en } from '../../src/i18n/en.ts';
import { eo, eoFormatWords } from '../../src/i18n/eo.ts';
import { es } from '../../src/i18n/es.ts';
import { fi } from '../../src/i18n/fi.ts';
import { fr } from '../../src/i18n/fr.ts';
import { formats, t, useLocale } from '../../src/i18n/index.ts';
import { la, laFormatWords } from '../../src/i18n/la.ts';
import { AUTOMATIC, resolveLocale, type Language } from '../../src/i18n/locale.ts';
import { counter } from '../../src/i18n/plural.ts';
import { sv } from '../../src/i18n/sv.ts';
import { MAP_REGIONS } from '../../src/view/mapRegions.ts';
import { countryName, formatDate, formatDateSpan, formatList, formatTime, formatWeekday } from '../../src/view/format.ts';
import { readText } from '../helpers.ts';

const CATALOGS = [en, de, fr, es, sv, fi, la, eo];
const OCTOBER_17 = Date.UTC(2026, 9, 17);
/** en-GB sets a range's dash between thin spaces. */
const RANGE_DASH = ' – ';
const NO_BREAK_SPACE = ' ';

afterEach(() => {
  vi.unstubAllGlobals();
  useLocale({ language: 'en', clock: null, distance: null }, ['en-GB']);
});

describe('resolveLocale', () => {
  it('picks the first browser language the app speaks, with that browser region for formats', () => {
    expect(resolveLocale(AUTOMATIC, ['pt-BR', 'de-AT', 'en'])).toEqual({ language: 'de', tag: 'de-AT', hourCycle: undefined, distance: 'km' });
    expect(resolveLocale(AUTOMATIC, ['fr'])).toEqual({ language: 'fr', tag: 'fr-FR', hourCycle: undefined, distance: 'km' });
    expect(resolveLocale(AUTOMATIC, ['en-GB'])).toEqual({ language: 'en', tag: 'en-GB', hourCycle: undefined, distance: 'km' });
  });

  it('resolves Swedish, Finnish, Latin and Esperanto, keeping la and eo as the page language', () => {
    expect(resolveLocale(AUTOMATIC, ['sv-SE', 'en'])).toEqual({ language: 'sv', tag: 'sv-SE', hourCycle: undefined, distance: 'mil' });
    expect(resolveLocale(AUTOMATIC, ['fi'])).toEqual({ language: 'fi', tag: 'fi-FI', hourCycle: undefined, distance: 'km' });
    expect(resolveLocale(AUTOMATIC, ['la', 'en-US'])).toEqual({ language: 'la', tag: 'la', hourCycle: undefined, distance: 'km' });
    expect(resolveLocale(AUTOMATIC, ['pt-BR', 'eo'])).toEqual({ language: 'eo', tag: 'eo', hourCycle: undefined, distance: 'km' });
  });

  it('falls back to US English, and ignores tags the browser cannot parse', () => {
    expect(resolveLocale(AUTOMATIC, ['pt-BR', 'not a tag!'])).toEqual({ language: 'en', tag: 'en-US', hourCycle: undefined, distance: 'mi' });
    expect(resolveLocale(AUTOMATIC, [])).toEqual({ language: 'en', tag: 'en-US', hourCycle: undefined, distance: 'mi' });
  });

  it('lets a choice from the settings win over the browser', () => {
    expect(resolveLocale({ language: 'es', clock: '24', distance: null }, ['de-CH'])).toEqual({ language: 'es', tag: 'es-ES', hourCycle: 'h23', distance: 'km' });
    expect(resolveLocale({ language: null, clock: '12', distance: null }, ['de-CH'])).toEqual({ language: 'de', tag: 'de-CH', hourCycle: 'h12', distance: 'km' });
  });
});

describe('distance units', () => {
  it('counts in miles in the US, in mil in Swedish and in kilometres elsewhere', () => {
    expect(resolveLocale(AUTOMATIC, ['en-US']).distance).toBe('mi');
    expect(resolveLocale(AUTOMATIC, ['en']).distance).toBe('mi');
    expect(resolveLocale(AUTOMATIC, ['en-GB']).distance).toBe('km');
    expect(resolveLocale(AUTOMATIC, ['es-US']).distance).toBe('mi');
    expect(resolveLocale(AUTOMATIC, ['sv-FI']).distance).toBe('mil');
    expect(resolveLocale(AUTOMATIC, ['de-DE']).distance).toBe('km');
  });

  it('lets the settings pick any unit', () => {
    expect(resolveLocale({ ...AUTOMATIC, distance: 'km' }, ['en-US']).distance).toBe('km');
    expect(resolveLocale({ ...AUTOMATIC, distance: 'mil' }, ['fr-FR']).distance).toBe('mil');
  });

  it('formats distances with the decimal mark of the language and no digit grouping', () => {
    expect(formats().distance(1000, 'km')).toBe(`1000${NO_BREAK_SPACE}km`);
    expect(formats().distance(2.5, 'mil')).toBe(`2.5${NO_BREAK_SPACE}mil`);
    useLocale(AUTOMATIC, ['sv-SE']);
    expect(formats().distance(2.5, 'mil')).toBe(`2,5${NO_BREAK_SPACE}mil`);
    useLocale(AUTOMATIC, ['la']);
    expect(formats().distance(2.5, 'mil')).toBe(`2,5${NO_BREAK_SPACE}mil`);
  });
});

describe('plurals', () => {
  it('follows each language, e.g. French counts 0 as singular', () => {
    expect(counter('fr')(0, { one: '# concert', other: '# concerts' })).toBe('0 concert');
    expect(counter('en')(0, { one: '# show', other: '# shows' })).toBe('0 shows');
    expect(counter('de')(1234, { one: '# Konzert', other: '# Konzerte' })).toBe('1.234 Konzerte');
  });
});

describe('formats', () => {
  it('formats dates, ranges, times and country names in the active locale', () => {
    useLocale({ language: 'de', clock: null, distance: null }, ['de-DE']);
    expect(formatDate('2026-10-17')).toBe('17. Okt. 2026');
    expect(formatDateSpan('2026-11-02', '2026-11-05')).toBe('2.–5. Nov. 2026');
    expect(formatTime('20:00')).toBe('20:00');
    expect(countryName('DE')).toBe('Deutschland');
    expect(t().shows(2)).toBe('2 Konzerte');
  });

  it('uses a 12-hour clock for US English and the choice from the settings', () => {
    useLocale(AUTOMATIC, ['en-US']);
    expect(formatTime('20:00')).toBe('8:00 PM');
    useLocale({ language: null, clock: '24', distance: null }, ['en-US']);
    expect(formatTime('20:00')).toBe('20:00');
    useLocale({ language: null, clock: '12', distance: null }, ['en-GB']);
    expect(formatTime('20:00').toLowerCase()).toBe('8:00 pm');
  });

  it('names Swedish and Finnish months through Intl', () => {
    useLocale(AUTOMATIC, ['sv-SE']);
    expect(formats().month.format(OCTOBER_17)).toBe('oktober 2026');
    expect(formatDate('2026-10-17')).toBe('17 okt. 2026');
    expect(countryName('FI')).toBe('Finland');
    useLocale(AUTOMATIC, ['fi-FI']);
    expect(formats().month.format(OCTOBER_17)).toBe('lokakuu 2026');
    expect(formats().axisMonth.format(OCTOBER_17)).toBe('loka');
    expect(countryName('SE')).toBe('Ruotsi');
  });

  it('formats Latin with its own calendar words, list conjunction, country names and plurals', () => {
    useLocale(AUTOMATIC, ['la']);
    expect(formatDate('2026-10-17')).toBe('17 Oct. 2026');
    expect(formatWeekday('2026-10-17')).toBe('Sat.');
    expect(formats().month.format(OCTOBER_17)).toBe('October 2026');
    expect(formats().axisDay.format(OCTOBER_17)).toBe('Sat. 17');
    expect(formatDateSpan('2026-11-02', '2026-11-05')).toBe(`2${RANGE_DASH}5 Nov. 2026`);
    expect(formatDateSpan('2026-10-30', '2026-11-02')).toBe(`30 Oct.${RANGE_DASH}2 Nov. 2026`);
    expect(formatTime('20:00')).toBe('20:00');
    expect(formatList(['Berolinum', 'Roma', 'Lutetia'])).toBe('Berolinum, Roma et Lutetia');
    expect(countryName('DE')).toBe('Germania');
    expect(t().bands(1)).toBe('1 grex');
    expect(t().bands(1234)).toBe(`1${NO_BREAK_SPACE}234 greges`);
    useLocale({ language: 'la', clock: '12', distance: null }, ['la']);
    expect(formatTime('20:00')).toBe('8:00 p.m.');
    expect(formatTime('09:30')).toBe('9:30 a.m.');
  });

  it('formats Esperanto with its own calendar words, list conjunction, country names and plurals', () => {
    useLocale(AUTOMATIC, ['eo']);
    expect(formatDate('2026-10-17')).toBe('17 okt. 2026');
    expect(formatWeekday('2026-10-17')).toBe('sa');
    expect(formats().axisDay.format(OCTOBER_17)).toBe('sa 17');
    expect(formats().month.format(OCTOBER_17)).toBe('oktobro 2026');
    expect(formatDateSpan('2026-12-30', '2027-01-02')).toBe(`30 dec. 2026${RANGE_DASH}2 jan. 2027`);
    expect(formatList(['Berlino', 'Romo'])).toBe('Berlino kaj Romo');
    expect(formatList(['Berlino', 'Romo', 'Parizo'])).toBe('Berlino, Romo kaj Parizo');
    expect(countryName('DE')).toBe('Germanio');
    expect(countryName('US')).toBe('Usono');
    expect(t().shows(1)).toBe('1 koncerto');
    expect(t().shows(0)).toBe('0 koncertoj');
    expect(t().shows(1234)).toBe(`1${NO_BREAK_SPACE}234 koncertoj`);
    useLocale({ language: 'eo', clock: '12', distance: null }, ['eo']);
    expect(formatTime('20:00')).toBe('8:00 ptm');
  });

  it('formats Latin and Esperanto the same in a browser that has no data for them', async () => {
    const native = await sampleOwnWordOutputs();
    vi.stubGlobal('Intl', intlWithoutLatinOrEsperanto('de-DE'));
    vi.resetModules();
    expect(new Intl.DateTimeFormat('eo', { month: 'long', timeZone: 'UTC' }).format(OCTOBER_17)).toBe('Oktober');
    expect(await sampleOwnWordOutputs()).toEqual(native);
  });
});

describe('catalogs', () => {
  it('renders validation issues in every language, keeping the English message for the tools', () => {
    const [issue] = validateDraft({ schemaVersion: 2 }, 'x.json').issues;
    if (issue === undefined) throw new Error('expected an issue');
    expect(issue.message).toBe('must be 1 (got 2)');
    expect(issueText(en.issues, issue)).toBe('must be 1 (got 2)');
    expect(issueText(de.issues, issue)).toBe('muss 1 sein (gefunden: 2)');
    expect(issueText(fr.issues, issue)).toBe('doit valoir 1 (reçu : 2)');
    expect(issueText(es.issues, issue)).toBe('debe ser 1 (se encontró 2)');
    expect(issueText(sv.issues, issue)).toBe('måste vara 1 (hittade: 2)');
    expect(issueText(fi.issues, issue)).toBe('on oltava 1 (nyt 2)');
    expect(issueText(la.issues, issue)).toBe('1 esse debet (inventum: 2)');
    expect(issueText(eo.issues, issue)).toBe('devas esti 1 (trovita: 2)');
  });

  it('names every map region in every language, since browsers do not reliably know continent names', () => {
    for (const catalog of CATALOGS) {
      for (const region of MAP_REGIONS) expect(catalog.map.regionNames[region.id].trim(), region.id).not.toBe('');
    }
    expect(de.map.regionNames['north-america']).toBe('Nordamerika');
    expect(fi.map.regionNames['north-america']).toBe('Pohjois-Amerikka');
    expect(la.map.regionNames['north-america']).toBe('America Septentrionalis');
  });

  it('has every text index.html asks for', () => {
    const keys = [...readText('index.html').matchAll(/data-i18n(?:-label|-title)?="([^"]+)"/g)].map((match) => match[1] ?? '');
    expect(keys.length).toBeGreaterThan(10);
    for (const catalog of CATALOGS) {
      for (const key of keys) expect(Object.hasOwn(catalog.page, key), key).toBe(true);
    }
  });

  it('names every country code in Latin and Esperanto', () => {
    const codes = Object.keys(NUMERIC_BY_ALPHA2).sort();
    for (const words of [laFormatWords, eoFormatWords]) {
      expect(Object.keys(words.countryNames).sort()).toEqual(codes);
      for (const [code, name] of Object.entries(words.countryNames)) expect(name.trim(), code).not.toBe('');
    }
  });
});

/** Every Latin and Esperanto format, through fresh modules so catalogs and formats are built in the current Intl. */
async function sampleOwnWordOutputs(): Promise<Record<string, string[]>> {
  const i18n = await import('../../src/i18n/index.ts');
  const format = await import('../../src/view/format.ts');
  const languages: readonly Language[] = ['la', 'eo'];
  return Object.fromEntries(
    languages.map((language) => {
      i18n.useLocale({ language, clock: '12', distance: null }, [language]);
      const own = i18n.formats();
      return [
        language,
        [
          format.formatDate('2026-10-17'),
          format.formatWeekday('2026-10-17'),
          format.formatDateSpan('2026-10-30', '2026-11-02'),
          format.formatTime('20:00'),
          format.formatList(['A', 'B', 'C']),
          format.countryName('DE'),
          own.month.format(OCTOBER_17),
          own.axisDay.format(OCTOBER_17),
          own.axisMonthYear.format(OCTOBER_17),
          own.timeOnClock(undefined).format(OCTOBER_17),
          i18n.t().shows(1),
          i18n.t().shows(1234),
        ],
      ];
    }),
  );
}

/** Intl as a browser without Latin or Esperanto data ships it: those tags quietly fall back to the browser's own language. */
function intlWithoutLatinOrEsperanto(browserDefault: string): typeof Intl {
  const known = (locales: Intl.LocalesArgument): string[] => {
    const tags = (locales === undefined ? [] : Array.isArray(locales) ? locales : [locales]).map(String);
    const supported = tags.filter((tag) => !['la', 'eo'].includes(tag.split('-')[0] ?? ''));
    return supported.length === 0 ? [browserDefault] : supported;
  };
  class DateTimeFormat extends Intl.DateTimeFormat {
    constructor(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
      super(known(locales), options);
    }
  }
  class NumberFormat extends Intl.NumberFormat {
    constructor(locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions) {
      super(known(locales), options);
    }
  }
  class PluralRules extends Intl.PluralRules {
    constructor(locales?: Intl.LocalesArgument, options?: Intl.PluralRulesOptions) {
      super(known(locales), options);
    }
  }
  class ListFormat extends Intl.ListFormat {
    constructor(locales?: Intl.LocalesArgument, options?: Intl.ListFormatOptions) {
      super(known(locales), options);
    }
  }
  class DisplayNames extends Intl.DisplayNames {
    constructor(locales: Intl.LocalesArgument, options: Intl.DisplayNamesOptions) {
      super(known(locales), options);
    }
  }
  return Object.assign(Object.create(Intl) as typeof Intl, { DateTimeFormat, NumberFormat, PluralRules, ListFormat, DisplayNames });
}
