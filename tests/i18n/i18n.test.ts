import { afterEach, describe, expect, it } from 'vitest';
import { issueText } from '../../src/data/issues.ts';
import { validateDraft } from '../../src/data/validate.ts';
import { de } from '../../src/i18n/de.ts';
import { en } from '../../src/i18n/en.ts';
import { es } from '../../src/i18n/es.ts';
import { fr } from '../../src/i18n/fr.ts';
import { t, useLocale } from '../../src/i18n/index.ts';
import { AUTOMATIC, resolveLocale } from '../../src/i18n/locale.ts';
import { counter } from '../../src/i18n/plural.ts';
import { countryName, formatDate, formatDateSpan, formatTime } from '../../src/view/format.ts';
import { readText } from '../helpers.ts';

afterEach(() => useLocale({ language: 'en', clock: null }, ['en-GB']));

describe('resolveLocale', () => {
  it('picks the first browser language the app speaks, with that browser region for formats', () => {
    expect(resolveLocale(AUTOMATIC, ['pt-BR', 'de-AT', 'en'])).toEqual({ language: 'de', tag: 'de-AT', hourCycle: undefined });
    expect(resolveLocale(AUTOMATIC, ['fr'])).toEqual({ language: 'fr', tag: 'fr-FR', hourCycle: undefined });
    expect(resolveLocale(AUTOMATIC, ['en-GB'])).toEqual({ language: 'en', tag: 'en-GB', hourCycle: undefined });
  });

  it('falls back to US English, and ignores tags the browser cannot parse', () => {
    expect(resolveLocale(AUTOMATIC, ['pt-BR', 'not a tag!'])).toEqual({ language: 'en', tag: 'en-US', hourCycle: undefined });
    expect(resolveLocale(AUTOMATIC, [])).toEqual({ language: 'en', tag: 'en-US', hourCycle: undefined });
  });

  it('lets a choice from the settings win over the browser', () => {
    expect(resolveLocale({ language: 'es', clock: '24' }, ['de-CH'])).toEqual({ language: 'es', tag: 'es-ES', hourCycle: 'h23' });
    expect(resolveLocale({ language: null, clock: '12' }, ['de-CH'])).toEqual({ language: 'de', tag: 'de-CH', hourCycle: 'h12' });
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
    useLocale({ language: 'de', clock: null }, ['de-DE']);
    expect(formatDate('2026-10-17')).toBe('17. Okt. 2026');
    expect(formatDateSpan('2026-11-02', '2026-11-05')).toBe('2.–5. Nov. 2026');
    expect(formatTime('20:00')).toBe('20:00');
    expect(countryName('DE')).toBe('Deutschland');
    expect(t().shows(2)).toBe('2 Konzerte');
  });

  it('uses a 12-hour clock for US English and the choice from the settings', () => {
    useLocale(AUTOMATIC, ['en-US']);
    expect(formatTime('20:00')).toBe('8:00 PM');
    useLocale({ language: null, clock: '24' }, ['en-US']);
    expect(formatTime('20:00')).toBe('20:00');
    useLocale({ language: null, clock: '12' }, ['en-GB']);
    expect(formatTime('20:00').toLowerCase()).toBe('8:00 pm');
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
  });

  it('has every text index.html asks for', () => {
    const keys = [...readText('index.html').matchAll(/data-i18n(?:-label|-title)?="([^"]+)"/g)].map((match) => match[1] ?? '');
    expect(keys.length).toBeGreaterThan(10);
    for (const catalog of [en, de, fr, es]) {
      for (const key of keys) expect(Object.hasOwn(catalog.page, key), key).toBe(true);
    }
  });
});
