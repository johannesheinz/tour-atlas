import { describe, expect, it } from 'vitest';
import { cacheName, cachedFile, staleCaches } from '../../src/sw/offlineCache.ts';

describe('cachedFile', () => {
  const scope = new URL('https://example.org/tour-atlas/');
  const files = ['index.html', 'icon-192.png', 'inter-tight-latin-400-normal-AbC123.woff2'];
  const url = (path: string) => new URL(path, scope);

  it('opens the app from the copy at the scope or index.html, whatever the query', () => {
    expect(cachedFile(url('./'), scope, true, files)).toBe('index.html');
    expect(cachedFile(url('index.html'), scope, true, files)).toBe('index.html');
    expect(cachedFile(url('./?utm_source=feed'), scope, true, files)).toBe('index.html');
  });

  it('answers exactly the listed files', () => {
    expect(cachedFile(url('icon-192.png'), scope, false, files)).toBe('icon-192.png');
    expect(cachedFile(url('inter-tight-latin-400-normal-AbC123.woff2'), scope, false, files)).toBe('inter-tight-latin-400-normal-AbC123.woff2');
    expect(cachedFile(url('icon-192.png?v=2'), scope, false, files)).toBeNull();
    expect(cachedFile(url('og-card.png'), scope, false, files)).toBeNull();
  });

  it('leaves other pages, other paths and other origins to the network', () => {
    expect(cachedFile(url('docs/'), scope, true, files)).toBeNull();
    expect(cachedFile(new URL('https://example.org/index.html'), scope, true, files)).toBeNull();
    expect(cachedFile(new URL('https://example.org/icon-192.png'), scope, false, files)).toBeNull();
    expect(cachedFile(new URL('https://other.example.org/tour-atlas/icon-192.png'), scope, false, files)).toBeNull();
  });
});

describe('staleCaches', () => {
  it("lists earlier builds' caches and leaves the current one and other caches alone", () => {
    expect(staleCaches([cacheName('old1'), cacheName('new'), 'someone-else', cacheName('old2')], 'new')).toEqual([cacheName('old1'), cacheName('old2')]);
  });
});
