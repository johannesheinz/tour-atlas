import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pngDimensions } from '../../tools/vite/socialCard.ts';
import { APP_ICONS, APPLE_TOUCH_ICON, MANIFEST_FILE, WEB_APP_FILES, injectWebAppLinks, pageDescription, webAppManifest, webAppProblems } from '../../tools/vite/webApp.ts';
import { readText } from '../helpers.ts';

const brandFile = (file: string) => readFileSync(join('src/brand', file));

describe('webAppManifest', () => {
  it('installs the site as a standalone app, relative to wherever it is served', () => {
    const manifest = webAppManifest('Tour dates on one map.');
    expect(manifest).toMatchObject({ name: 'Tour Atlas', start_url: './', scope: './', id: './', display: 'standalone', description: 'Tour dates on one map.' });
    expect(manifest.icons.map((icon) => `${icon.src} ${icon.sizes} ${icon.purpose}`)).toEqual([
      'icon-192.png 192x192 any',
      'icon-512.png 512x512 any',
      'icon-maskable-512.png 512x512 maskable',
    ]);
  });
});

describe('pageDescription', () => {
  it("reads index.html's description and refuses one it would have to unescape", () => {
    expect(pageDescription(readText('index.html'))).toMatch(/^Follow your favourite bands/);
    expect(() => pageDescription('<meta name="description" content="Rock &amp; roll" />')).toThrow(/without markup characters/);
    expect(() => pageDescription('<head></head>')).toThrow(/needs a <meta name="description">/);
  });
});

describe('injectWebAppLinks', () => {
  it('links the manifest and the touch icon in <head>', () => {
    const html = injectWebAppLinks('<head><title>T</title></head>');
    expect(html).toContain('<link rel="manifest" href="manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="apple-touch-icon.png" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Tour Atlas" />\n  </head>');
    expect(() => injectWebAppLinks('<title>T</title>')).toThrow(/no <\/head>/);
  });
});

describe('the committed icons', () => {
  it('have the sizes the manifest and the touch icon link promise', () => {
    for (const icon of APP_ICONS) expect(pngDimensions(brandFile(icon.file)), icon.file).toEqual({ width: icon.size, height: icon.size });
  });
});

describe('webAppProblems', () => {
  const html = injectWebAppLinks('<head></head>');
  const distFiles = (manifest: string): Map<string, Uint8Array> =>
    new Map<string, Uint8Array>([[MANIFEST_FILE, new TextEncoder().encode(manifest)], ...APP_ICONS.map((icon) => [icon.file, brandFile(icon.file)] as const)]);
  const problems = (files: Map<string, Uint8Array>, page = html) =>
    webAppProblems(page, [...files.keys()], (file) => {
      const bytes = files.get(file);
      if (bytes === undefined) throw new Error(`read ${file}, which is not in dist`);
      return bytes;
    });
  const goodManifest = JSON.stringify(webAppManifest('Tour dates.'));

  it('accepts what the build writes', () => {
    expect(problems(distFiles(goodManifest))).toEqual([]);
  });

  it('reports missing files and links', () => {
    const files = distFiles(goodManifest);
    files.delete(APPLE_TOUCH_ICON.file);
    expect(problems(files, '<head></head>')).toEqual([
      'apple-touch-icon.png is missing; browsers cannot install the app without it',
      'index.html does not link manifest.webmanifest',
      'index.html does not link apple-touch-icon.png',
    ]);
    expect(WEB_APP_FILES).toContain(MANIFEST_FILE);
  });

  it('reports a manifest browsers would not install', () => {
    const manifest = { ...webAppManifest('Tour dates.'), display: 'browser', start_url: '/', name: '' };
    manifest.icons = manifest.icons.filter((icon) => icon.purpose !== 'maskable').map((icon) => ({ ...icon, sizes: icon.sizes === '192x192' ? '512x512' : icon.sizes }));
    expect(problems(distFiles(JSON.stringify(manifest)))).toEqual([
      'manifest.webmanifest must set start_url to "./"',
      'manifest.webmanifest must set display to "standalone"',
      'manifest.webmanifest has no name',
      'icon-192.png is 192x192; it must be 512x512',
      'manifest.webmanifest needs a 192x192 icon',
      'manifest.webmanifest needs a 512x512 maskable icon',
    ]);
    expect(problems(distFiles('{'))).toEqual(['manifest.webmanifest is not JSON']);
  });
});
