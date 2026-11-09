import { describe, expect, it } from 'vitest';
import { SESSION_STORAGE_KEY, isInstalledApp, loadSessionView, restoreSessionView, saveSessionView, type SessionStorage } from '../../src/sessionState.ts';

function memoryStorage(initial: Record<string, string> = {}): SessionStorage & { readonly values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('isInstalledApp', () => {
  it('accepts the iOS home-screen flag and the standalone display mode', () => {
    expect(isInstalledApp(true, () => false)).toBe(true);
    expect(isInstalledApp(false, (query) => query === '(display-mode: standalone)')).toBe(true);
  });

  it('rejects an ordinary browser tab', () => {
    expect(isInstalledApp(false, () => false)).toBe(false);
  });
});

describe('loadSessionView', () => {
  it('reads the one namespaced key and treats an empty value as the default view', () => {
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: '#band=alpha' });
    expect(loadSessionView(storage)).toBe('#band=alpha');
    expect(loadSessionView(memoryStorage({ [SESSION_STORAGE_KEY]: '' }))).toBe('');
  });

  it('ignores missing, malformed and unreadable storage', () => {
    expect(loadSessionView(null)).toBeNull();
    expect(loadSessionView(memoryStorage())).toBeNull();
    expect(loadSessionView(memoryStorage({ [SESSION_STORAGE_KEY]: 'band=alpha' }))).toBeNull();
    expect(loadSessionView({ getItem: () => { throw new Error('denied'); }, setItem: () => undefined })).toBeNull();
  });
});

describe('saveSessionView', () => {
  it('writes the view hash under the namespaced key', () => {
    const storage = memoryStorage();
    saveSessionView(storage, '#band=alpha&theme=dark');
    expect(storage.values.get(SESSION_STORAGE_KEY)).toBe('#band=alpha&theme=dark');
  });

  it('keeps working when storage is full or unavailable', () => {
    expect(() => saveSessionView(null, '#band=alpha')).not.toThrow();
    expect(() => saveSessionView({ getItem: () => null, setItem: () => { throw new Error('full'); } }, '#band=alpha')).not.toThrow();
  });
});

describe('restoreSessionView', () => {
  it('uses the saved view when the address bar has no hash', () => {
    expect(restoreSessionView('', '#band=alpha&theme=dark&lang=de')).toBe('#band=alpha&theme=dark&lang=de');
    expect(restoreSessionView('', '')).toBe('');
    expect(restoreSessionView('', null)).toBe('');
  });

  it('lets the address bar win for every parameter it names, including the view', () => {
    expect(restoreSessionView('#band=alpha', null)).toBe('#band=alpha');
    expect(restoreSessionView('#band=alpha', '')).toBe('#band=alpha');
    expect(restoreSessionView('#theme=light&band=alpha', '#theme=dark&band=beta&lang=de')).toBe('#theme=light&band=alpha&lang=de');
    expect(restoreSessionView('#band=alpha', '#band=beta&from=2026-01-01&to=2026-01-31')).toBe('#band=alpha');
  });

  it('fills only the settings a shared link leaves out, so it does not reset the app', () => {
    expect(restoreSessionView('#genre=doom', '#band=beta&theme=dark&style=atlas&clock=24&units=mil')).toBe(
      '#genre=doom&style=atlas&theme=dark&clock=24&units=mil',
    );
  });

  it('keeps the comma-friendly form the app writes', () => {
    expect(restoreSessionView('#hide=alpha,beta&from=2026-01-01', '#theme=dark')).toBe('#hide=alpha,beta&from=2026-01-01&theme=dark');
  });
});