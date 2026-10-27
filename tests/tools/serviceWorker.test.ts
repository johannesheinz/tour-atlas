import { describe, expect, it } from 'vitest';
import { precacheOf, readPrecache, serviceWorkerProblems, serviceWorkerSource } from '../../tools/vite/serviceWorker.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const BUILD = new Map([
  ['index.html', bytes('<html></html>')],
  ['icon-192.png', bytes('png')],
  ['og-card.png', bytes('card')],
  ['a-font-123.woff2', bytes('font')],
]);
const WORKER = 'self.addEventListener(`fetch`,e=>{});';

describe('precacheOf', () => {
  it('lists every file but the social card, sorted, with a hash of names and contents', () => {
    const precache = precacheOf(BUILD);
    expect(precache.files).toEqual(['a-font-123.woff2', 'icon-192.png', 'index.html']);
    expect(precache.version).toMatch(/^[0-9a-f]{16}$/);
    expect(precacheOf(new Map(BUILD).set('og-card.png', bytes('other card'))).version).toBe(precache.version);
    expect(precacheOf(new Map(BUILD).set('index.html', bytes('<html>new dates</html>'))).version).not.toBe(precache.version);
  });

  it('refuses a build without a page', () => {
    expect(() => precacheOf(new Map([['icon-192.png', bytes('png')]]))).toThrow(/no index.html/);
  });
});

describe('readPrecache', () => {
  it('reads back the first line the build writes', () => {
    const precache = precacheOf(BUILD);
    expect(readPrecache(serviceWorkerSource(precache, WORKER))).toEqual(precache);
    expect(readPrecache(WORKER)).toBeNull();
  });
});

describe('serviceWorkerProblems', () => {
  const dist = (worker: string, files = BUILD) => {
    const all = new Map(files).set('sw.js', bytes(worker));
    return serviceWorkerProblems([...all.keys()], (file) => {
      const content = all.get(file);
      if (content === undefined) throw new Error(`read ${file}, which is not in dist`);
      return content;
    });
  };

  it('accepts what the build writes', () => {
    expect(dist(serviceWorkerSource(precacheOf(BUILD), WORKER))).toEqual([]);
  });

  it('reports a missing worker and one without its list', () => {
    expect(serviceWorkerProblems(['index.html'], () => bytes(''))).toEqual(['sw.js is missing; the app would not open offline']);
    expect(dist(WORKER)).toEqual(['sw.js does not start with its precache list']);
  });

  it('reports files it would not keep, files that are gone and a stale version', () => {
    const precache = precacheOf(BUILD);
    const withNewLogo = new Map(BUILD).set('new-band-1.webp', bytes('logo'));
    expect(dist(serviceWorkerSource(precache, WORKER), withNewLogo)).toEqual(['sw.js does not keep new-band-1.webp offline']);
    const withoutIcon = new Map(BUILD);
    withoutIcon.delete('icon-192.png');
    expect(dist(serviceWorkerSource(precache, WORKER), withoutIcon)).toEqual(['sw.js lists icon-192.png, which dist does not have']);
    const changedPage = new Map(BUILD).set('index.html', bytes('<html>new dates</html>'));
    expect(dist(serviceWorkerSource(precache, WORKER), changedPage)[0]).toMatch(/^sw.js has version \w+, but the files hash to \w+; installed apps would not update$/);
  });

  it('reports a worker that reaches beyond the site', () => {
    const source = (worker: string) => serviceWorkerSource(precacheOf(BUILD), worker);
    expect(dist(source('fetch(`https://cdn.example.com/x.js`)'))).toEqual(['sw.js contains an absolute URL']);
    expect(dist(source('importScripts(`x.js`)'))).toEqual(['sw.js contains importScripts']);
    expect(dist(source('indexedDB.open(`x`)'))).toEqual(['sw.js contains indexedDB']);
  });
});
