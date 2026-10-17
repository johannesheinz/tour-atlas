import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BandFile } from '../../src/data/types.ts';
import { StaticStore } from '../../src/store/StaticStore.ts';
import { BRAND_MARK_PLACEHOLDER, faviconDataUri, injectBrand } from '../../tools/vite/brand.ts';
import { injectContentSecurityPolicy } from '../../tools/vite/csp.ts';
import { slimWorldTopology } from '../../tools/vite/worldTopology.ts';
import { makeFile, makeShow } from '../helpers.ts';

describe('injectContentSecurityPolicy', () => {
  const html = '<head><meta charset="utf-8" /><script type="module">run()</script><style>body{}</style></head>';

  it('allows only the inlined script and style by hash and forbids network access', () => {
    const result = injectContentSecurityPolicy(html);
    expect(result).toContain("default-src 'none'");
    expect(result).toContain("connect-src 'none'");
    expect(result).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(result).toMatch(/style-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(result.indexOf('Content-Security-Policy')).toBeLessThan(result.indexOf('<script'));
  });

  it('refuses html without an inline script', () => {
    expect(() => injectContentSecurityPolicy('<head><meta charset="utf-8" /></head>')).toThrow(/no inline script/);
  });
});

describe('injectBrand', () => {
  const mark = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle r="1"/></svg>';
  const favicon = '<svg xmlns="http://www.w3.org/2000/svg">\n  <path d="M0 0"/>\n</svg>\n';

  it('puts the mark, hidden from screen readers, where the placeholder is and links the favicon inline', () => {
    const result = injectBrand(`<head><title>T</title></head><h1>${BRAND_MARK_PLACEHOLDER}Tour Atlas</h1>`, mark, favicon);
    expect(result).toContain('<h1><svg class="brand-mark" aria-hidden="true" xmlns=');
    expect(result).toContain(`<link rel="icon" type="image/svg+xml" href="${faviconDataUri(favicon)}" />\n  </head>`);
    expect(result).not.toContain(BRAND_MARK_PLACEHOLDER);
  });

  it('encodes the favicon so it cannot break out of the attribute', () => {
    expect(faviconDataUri(favicon)).toBe(`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')}`);
    expect(faviconDataUri(favicon)).not.toMatch(/["<>]/);
  });

  it('refuses html without the placeholder or a mark that is not an svg', () => {
    expect(() => injectBrand('<head></head><h1>Tour Atlas</h1>', mark, favicon)).toThrow(/needs <!-- brand-mark -->/);
    expect(() => injectBrand(`<head></head>${BRAND_MARK_PLACEHOLDER}`, '<?xml version="1.0"?><svg/>', favicon)).toThrow(/must start with <svg/);
  });

  it('works with the real index.html and brand files', () => {
    const result = injectBrand(readFileSync('index.html', 'utf8'), readFileSync('src/brand/mark.svg', 'utf8'), readFileSync('src/brand/favicon.svg', 'utf8'));
    expect(result).toMatch(/<h1 class="wordmark"><svg class="brand-mark" aria-hidden="true"[^]*<\/svg>Tour Atlas<\/h1>/);
    expect(result).toContain('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,');
  });
});

describe('slimWorldTopology', () => {
  it('drops country names and keeps countries and land', () => {
    const topology = slimWorldTopology();
    expect(topology.objects.countries.geometries.every((geometry) => !('properties' in geometry))).toBe(true);
    expect(topology.objects.land.geometries.length).toBeGreaterThan(0);
    expect(topology.transform?.scale[0]).toBeCloseTo(360 / (5e4 - 1), 6);
  });
});

describe('StaticStore', () => {
  it('lists bands by id and finds them by id', () => {
    const store = new StaticStore([makeFile([makeShow()], 'zeta') as BandFile, makeFile([], 'alpha') as BandFile]);
    expect(store.listBands().map((file) => file.band.id)).toEqual(['alpha', 'zeta']);
    expect(store.getBand('zeta')?.shows).toHaveLength(1);
    expect(store.getBand('missing')).toBeUndefined();
  });
});
