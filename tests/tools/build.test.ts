import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BandFile } from '../../src/data/types.ts';
import { StaticStore } from '../../src/store/StaticStore.ts';
import { BRAND_MARK_PLACEHOLDER, faviconDataUri, injectBrand } from '../../tools/vite/brand.ts';
import { injectContentSecurityPolicy } from '../../tools/vite/csp.ts';
import { loadOrderProblems, orderForLoading } from '../../tools/vite/loadOrder.ts';
import { SOCIAL_CARD_TAGS, escapeAttribute, injectSocialCard, parseSiteUrl, pngDimensions, socialCardProblems } from '../../tools/vite/socialCard.ts';
import { slimWorldTopology } from '../../tools/vite/worldTopology.ts';
import { makeFile, makeShow } from '../helpers.ts';

describe('injectContentSecurityPolicy', () => {
  const html = '<head><meta charset="utf-8" /><script type="module">run()</script><style>body{}</style></head>';

  it('allows only the inlined script and style by hash and forbids network access', () => {
    const result = injectContentSecurityPolicy(html);
    expect(result).toContain("default-src 'none'");
    expect(result).toContain("connect-src 'none'");
    expect(result).toContain("manifest-src 'self'");
    expect(result).toContain("worker-src 'self'");
    expect(result).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(result).toMatch(/style-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(result.indexOf('Content-Security-Policy')).toBeLessThan(result.indexOf('<script'));
  });

  it('refuses html without an inline script', () => {
    expect(() => injectContentSecurityPolicy('<head><meta charset="utf-8" /></head>')).toThrow(/no inline script/);
  });
});

describe('orderForLoading', () => {
  const singleFileOutput = [
    '<head>',
    '    <meta charset="utf-8" />',
    '    <title>T</title>',
    '    <script type="module">if (a < b) run("$&");</script>',
    '    <style>body{color:red}</style>',
    '  </head>',
    '  <body>',
    '    <h1>Tour Atlas</h1>',
    '  </body>',
  ].join('\n');

  it('puts the stylesheet before the title and the script at the end of the body, unchanged', () => {
    const result = orderForLoading(singleFileOutput);
    expect(result.indexOf('<style>body{color:red}</style>\n    <title>T</title>')).toBeGreaterThan(result.indexOf('<meta charset'));
    expect(result).toContain('<h1>Tour Atlas</h1>\n    <script type="module">if (a < b) run("$&");</script>\n  </body>');
    expect(loadOrderProblems(result)).toEqual([]);
  });

  it('keeps the CSP hashes, since the inline contents do not change', () => {
    const policy = (html: string) => /content="([^"]+)"/.exec(injectContentSecurityPolicy(html))?.[1];
    expect(policy(orderForLoading(singleFileOutput))).toBe(policy(singleFileOutput));
  });

  it('refuses output it cannot order unambiguously', () => {
    expect(() => orderForLoading(singleFileOutput.replace('</style>', '</style><style>p{}</style>'))).toThrow(/exactly one inline <style>, found 2/);
    expect(() => orderForLoading(singleFileOutput.replace(/<script[^]*<\/script>/, ''))).toThrow(/exactly one inline <script>, found 0/);
    expect(() => orderForLoading(singleFileOutput.replace('<title>T</title>', ''))).toThrow(/needs a <title>/);
  });
});

describe('loadOrderProblems', () => {
  it('reports a stylesheet after the script and a script before the page content', () => {
    expect(loadOrderProblems('<head><script type="module">x()</script><style>p{}</style></head><body></body>')).toEqual([
      'the inline <style> must come before the first <script> and <body>, or the page paints unstyled',
      'the inline <script> must come after the page content in <body>, or nothing shows while it downloads',
    ]);
    expect(loadOrderProblems('<head></head><body><style>p{}</style><script>x()</script></body>')).toEqual([
      'the inline <style> must come before the first <script> and <body>, or the page paints unstyled',
    ]);
    expect(loadOrderProblems('<head><style>p{}</style></head><body><noscript>No JavaScript</noscript><script>x()</script></body>')).toEqual([]);
    expect(loadOrderProblems('<head></head><body></body>')).toEqual(['index.html needs an inline <style>, an inline <script> and a <body>']);
  });
});

describe('injectBrand', () => {
  const mark = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle r="1"/></svg>';
  const favicon = '<svg xmlns="http://www.w3.org/2000/svg">\n  <path d="M0 0"/>\n</svg>\n';

  it('puts the mark, hidden from screen readers, where the placeholder is and links the favicon inline', () => {
    const result = injectBrand(`<head><title>T</title></head><h1>${BRAND_MARK_PLACEHOLDER}Tour Atlas</h1>`, mark, favicon);
    expect(result).toContain('<h1><svg class="brand-mark" aria-hidden="true" width="1em" height="1em" xmlns=');
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
    expect(result).toMatch(/<a class="wordmark-link"[^>]*><svg class="brand-mark" aria-hidden="true" width="1em" height="1em"[^]*<\/svg><span class="wordmark-text">Tour<span class="wordmark-space"> <\/span><span class="wordmark-light">Atlas<\/span><\/span><\/a><\/h1>/);
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

describe('parseSiteUrl', () => {
  it('is null when the variable is unset and the URL when it is the site address', () => {
    expect(parseSiteUrl(undefined)).toBeNull();
    expect(parseSiteUrl('https://example.org/tour-atlas/')?.href).toBe('https://example.org/tour-atlas/');
    expect(parseSiteUrl('https://example.org/')?.href).toBe('https://example.org/');
  });

  it('refuses anything else that is set', () => {
    expect(() => parseSiteUrl('')).toThrow(/absolute URL/);
    expect(() => parseSiteUrl('tour-atlas/')).toThrow(/absolute URL/);
    expect(() => parseSiteUrl('http://example.org/tour-atlas/')).toThrow(/https:/);
    expect(() => parseSiteUrl('https://example.org/tour-atlas')).toThrow(/end with "\/"/);
    expect(() => parseSiteUrl('https://example.org/tour-atlas/?ref=1')).toThrow(/query or hash/);
    expect(() => parseSiteUrl('https://example.org/tour-atlas/?')).toThrow(/query or hash/);
    expect(() => parseSiteUrl('https://example.org/tour-atlas/#top')).toThrow(/query or hash/);
    expect(() => parseSiteUrl('https://user:secret@example.org/')).toThrow(/credentials/);
  });
});

describe('injectSocialCard', () => {
  const template = (description: string) =>
    `<head>\n    <title>T</title>\n    <!-- social-card\n      og:site_name = Tour Atlas\n      og:title = Tour Atlas\n      og:description = ${description}\n      og:image:alt = The globe\n    -->\n  </head>`;
  const siteUrl = new URL('https://example.org/tour-atlas/');
  const counts = () => ({ bands: 12, shows: 3456 });

  it('writes every tag with absolute addresses and the counts filled in', () => {
    const html = injectSocialCard(template('{bands} bands, {shows} shows'), siteUrl, counts);
    for (const tag of SOCIAL_CARD_TAGS) expect(html).toMatch(new RegExp(`<meta (property|name)="${tag}" content="[^"]+" />`));
    expect(html).toContain('<meta property="og:description" content="12 bands, 3,456 shows" />');
    expect(html).toContain('<meta property="og:url" content="https://example.org/tour-atlas/" />');
    expect(html).toContain('<meta property="og:image" content="https://example.org/tour-atlas/og-card.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('    <title>T</title>\n    <meta property="og:type" content="website" />\n');
    expect(html).not.toContain('social-card');
  });

  it('removes the block and reads no band data when there is no site URL', () => {
    const html = injectSocialCard(template('{bands} bands'), null, () => {
      throw new Error('counted without a site URL');
    });
    expect(html).toBe('<head>\n    <title>T</title>\n  </head>');
  });

  it('escapes the texts so they cannot break out of the attribute', () => {
    expect(escapeAttribute(`"<b>" & 'x'`)).toBe('&quot;&lt;b&gt;&quot; &amp; &#39;x&#39;');
    const html = injectSocialCard(template('Rock & "roll" <live>'), siteUrl, counts);
    expect(html).toContain('content="Rock &amp; &quot;roll&quot; &lt;live&gt;"');
  });

  it('refuses a template it cannot fill completely', () => {
    expect(() => injectSocialCard('<head></head>', siteUrl, counts)).toThrow(/needs a <!-- social-card/);
    expect(() => injectSocialCard(template('{venues} venues'), siteUrl, counts)).toThrow(/unknown placeholder \{venues\}/);
    expect(() => injectSocialCard(template('ok').replace('      og:image:alt = The globe\n', ''), siteUrl, counts)).toThrow(/no og:image:alt/);
    expect(() => injectSocialCard(template('ok').replace('og:title =', 'og:locale ='), siteUrl, counts)).toThrow(/unknown property og:locale/);
  });

  it('works with the real index.html, and check-dist accepts the result with the real card image', () => {
    const indexHtml = readFileSync('index.html', 'utf8');
    const html = injectSocialCard(indexHtml, siteUrl, counts);
    expect(html).toMatch(/<meta property="og:description" content="Follow your favourite bands[^"]*: 12 bands, 3,456 shows[^"]*" \/>/);
    const card = readFileSync('src/brand/og-card.png');
    expect(pngDimensions(card)).toEqual({ width: 1200, height: 630 });
    expect(socialCardProblems(html, card, true)).toEqual([]);
    expect(injectSocialCard(indexHtml, null, counts)).not.toMatch(/og:|social-card/);
  });
});

describe('socialCardProblems', () => {
  const html = injectSocialCard(readFileSync('index.html', 'utf8'), new URL('https://example.org/tour-atlas/'), () => ({ bands: 1, shows: 2 }));
  const card = readFileSync('src/brand/og-card.png');
  const pngHeader = (width: number, height: number) => {
    const png = Buffer.from(card.subarray(0, 33));
    png.writeUInt32BE(width, 16);
    png.writeUInt32BE(height, 20);
    return png;
  };

  it('accepts a build without the card unless it is required', () => {
    expect(socialCardProblems('<head></head>', null, false)).toEqual([]);
    expect(socialCardProblems('<head></head>', null, true)).toEqual([
      'og-card.png is missing; build with TOUR_ATLAS_SITE_URL set',
      `social card tags missing: ${SOCIAL_CARD_TAGS.join(', ')}`,
    ]);
  });

  it('wants the image and the tags together', () => {
    expect(socialCardProblems('<head></head>', card, false)).toContain('og-card.png is not referenced by og:image');
    expect(socialCardProblems(html, null, false)).toEqual(['og:image names og-card.png, but dist does not have it']);
  });

  it('checks the image size and that og:image points at it', () => {
    expect(socialCardProblems(html, pngHeader(1200, 600), false)).toEqual(['og-card.png is 1200x600; it must be 1200x630']);
    expect(socialCardProblems(html, Buffer.from('not a png at all, really not one'), false)).toEqual(['og-card.png is not a PNG']);
    expect(socialCardProblems(html, Buffer.concat([card, Buffer.alloc(300_000)]), false)).toEqual([expect.stringMatching(/kB; it must stay under 300 kB/)]);
    const elsewhere = html.replace('https://example.org/tour-atlas/og-card.png', 'https://example.org/other.png');
    expect(socialCardProblems(elsewhere, card, false)).toEqual(['og:image must be the absolute https: address of og-card.png, found "https://example.org/other.png"']);
  });
});
