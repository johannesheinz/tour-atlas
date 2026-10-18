import { afterEach, describe, expect, it } from 'vitest';
import { useLocale } from '../../src/i18n/index.ts';
import { shareCapabilities, shareLink, shareText } from '../../src/share.ts';

afterEach(() => {
  useLocale({ language: 'en', clock: null, distance: null }, ['en-GB']);
});

describe('shareLink', () => {
  it('puts the given view hash on the page address, replacing the one in the address bar', () => {
    expect(shareLink('https://example.org/tour-atlas/#band=old', '#band=alpha,beta&view=europe')).toBe('https://example.org/tour-atlas/#band=alpha,beta&view=europe');
  });

  it('leaves out language, clock and distance unit and keeps the style and everything else', () => {
    const link = shareLink('https://example.org/tour-atlas/', '#band=alpha&from=2026-01-01&to=2026-03-31&globe=1&style=atlas&lang=de&clock=24&units=mil');
    expect(link).toBe('https://example.org/tour-atlas/#from=2026-01-01&to=2026-03-31&band=alpha&globe=1&style=atlas');
  });

  it('gives the bare page address for the default view', () => {
    expect(shareLink('https://example.org/tour-atlas/#lang=fr', '')).toBe('https://example.org/tour-atlas/');
    expect(shareLink('https://example.org/tour-atlas/index.html#lang=fr', '#lang=fr&units=km')).toBe('https://example.org/tour-atlas/index.html');
  });

  it('works for a page opened from disk and from a local server, keeping the query', () => {
    expect(shareLink('file:///Users/someone/dist/index.html#lang=sv', '#genre=doom')).toBe('file:///Users/someone/dist/index.html#genre=doom');
    expect(shareLink('http://localhost:4173/?debug#style=bold', '#style=bold&lang=la')).toBe('http://localhost:4173/?debug#style=bold');
  });
});

describe('shareText', () => {
  it('names the selection when there is one, in the active language', () => {
    expect(shareText(null)).toBe('Tour Atlas');
    expect(shareText('Alpha and Beta')).toBe('Alpha and Beta – Tour Atlas');
    useLocale({ language: 'de', clock: null, distance: null }, ['de-DE']);
    expect(shareText('Hamburg')).toBe('Hamburg – Tour Atlas');
  });
});

describe('shareCapabilities', () => {
  it('offers the system share sheet and the clipboard only where the browser has them', () => {
    expect(shareCapabilities({})).toEqual({ clipboard: false, nativeShare: false });
    expect(shareCapabilities({ share: () => Promise.resolve(), clipboard: { writeText: () => Promise.resolve() } })).toEqual({ clipboard: true, nativeShare: true });
    expect(shareCapabilities({ share: 'yes', clipboard: {} })).toEqual({ clipboard: false, nativeShare: false });
  });
});
