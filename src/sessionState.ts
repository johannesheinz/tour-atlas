/**
 * The installed app keeps the last view and settings between sessions. The web version does not: it only
 * reads and writes the URL hash, exactly as before. Everything here is DOM-free so the build check and the
 * tests can use it in Node.
 */

/** One namespaced key, so the installed app never touches anything else in the origin's storage. */
export const SESSION_STORAGE_KEY = 'tour-atlas.view';

/** `navigator.standalone` on iOS, or the display mode an installed Android/desktop app reports. */
export function isInstalledApp(iosStandalone: boolean, matchesDisplayMode: (query: string) => boolean): boolean {
  return iosStandalone || matchesDisplayMode('(display-mode: standalone)');
}

/** The two operations the installed app needs; a `Storage` fits, and tests can pass a plain object. */
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The saved hash, `''` for the default view, or null when nothing was saved (or storage is unavailable). */
export function loadSessionView(storage: SessionStorage | null): string | null {
  if (storage === null) return null;
  try {
    const value = storage.getItem(SESSION_STORAGE_KEY);
    return value === null || value === '' || value.startsWith('#') ? value : null;
  } catch {
    return null;
  }
}

/** A full or full-quota storage keeps the app working; it just forgets the view next time. */
export function saveSessionView(storage: SessionStorage | null, hash: string): void {
  if (storage === null) return;
  try {
    storage.setItem(SESSION_STORAGE_KEY, hash);
  } catch {
    // Storage can be denied by the browser's privacy settings; the view is still in the URL.
  }
}

/** Settings, unlike the view, survive opening a shared link: the link leaves them out on purpose. */
const SETTING_PARAMS = ['style', 'theme', 'lang', 'clock', 'units'] as const;

/**
 * The hash the app starts from: an address-bar hash wins for everything it names, the saved view fills the
 * rest. When the address bar has no hash, the whole saved view comes back.
 */
export function restoreSessionView(locationHash: string, storedHash: string | null): string {
  if (storedHash === null) return locationHash;
  if (locationHash === '') return storedHash;
  const url = new URLSearchParams(withoutHash(locationHash));
  const stored = new URLSearchParams(withoutHash(storedHash));
  for (const name of SETTING_PARAMS) {
    const value = stored.get(name);
    if (value !== null && !url.has(name)) url.set(name, value);
  }
  const text = url.toString().replaceAll('%2C', ',');
  return text === '' ? '' : `#${text}`;
}

function withoutHash(hash: string): string {
  return hash.startsWith('#') ? hash.slice(1) : hash;
}