/**
 * What the service worker (src/sw/serviceWorker.ts), the page, the build and check-dist share about the offline
 * copy. Pure: no DOM, no worker globals, no Node APIs.
 */
export const SERVICE_WORKER_FILE = 'sw.js';
export const SKIP_WAITING_MESSAGE = 'skip-waiting';
const CACHE_PREFIX = 'tour-atlas-';

/** The build's files that make up the offline copy, relative to the site's address, and a hash of their contents. */
export interface Precache {
  readonly version: string;
  readonly files: readonly string[];
}

export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

/** Caches of earlier builds; other caches on the origin are not the worker's to delete. */
export function staleCaches(names: readonly string[], currentVersion: string): string[] {
  return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== cacheName(currentVersion));
}

/**
 * The precached file that answers a request, or null to leave it to the network. Opening the app (the scope or
 * index.html, whatever the query) is the page; anything else must be one of the files, exactly.
 */
export function cachedFile(requestUrl: URL, scope: URL, navigation: boolean, files: readonly string[]): string | null {
  if (requestUrl.origin !== scope.origin || !requestUrl.pathname.startsWith(scope.pathname)) return null;
  const path = requestUrl.pathname.slice(scope.pathname.length);
  if (navigation) return path === '' || path === 'index.html' ? 'index.html' : null;
  return requestUrl.search === '' && files.includes(path) ? path : null;
}
