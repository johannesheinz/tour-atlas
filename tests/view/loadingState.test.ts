import { describe, expect, it } from 'vitest';
import { LOADING_CLASS, STARTUP_FAILED_CLASS, watchStartup, type ErrorEvents, type RootClasses } from '../../src/loadingState.ts';
import { readText } from '../helpers.ts';

function fakePage() {
  const classes = new Set([LOADING_CLASS]);
  const root: RootClasses = {
    contains: (token) => classes.has(token),
    remove: (token) => classes.delete(token),
    replace(token, newToken) {
      if (!classes.delete(token)) return false;
      classes.add(newToken);
      return true;
    },
  };
  const listeners = new Set<() => void>();
  const errors: ErrorEvents = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  let frames: (() => void)[] = [];
  const nextFrame = (callback: () => void) => frames.push(callback);
  const runFrame = () => {
    const due = frames;
    frames = [];
    for (const callback of due) callback();
  };
  const throwError = () => {
    for (const listener of listeners) listener();
  };
  return { classes, root, errors, listeners, nextFrame, runFrame, throwError };
}

describe('watchStartup', () => {
  it('ends the loading state in the frame after the first render, once', () => {
    const page = fakePage();
    const startup = watchStartup(page.root, page.errors, page.nextFrame);
    startup.finishAfterFirstFrame();
    page.runFrame();
    expect([...page.classes]).toEqual([LOADING_CLASS]);
    page.runFrame();
    expect([...page.classes]).toEqual([]);
    expect(page.listeners.size).toBe(0);
    expect(() => startup.finishAfterFirstFrame()).toThrow(/already ending/);
  });

  it('shows the start-up error for an error before the first view, and keeps it', () => {
    const page = fakePage();
    const startup = watchStartup(page.root, page.errors, page.nextFrame);
    page.throwError();
    expect([...page.classes]).toEqual([STARTUP_FAILED_CLASS]);
    startup.finishAfterFirstFrame();
    page.runFrame();
    page.runFrame();
    expect([...page.classes]).toEqual([STARTUP_FAILED_CLASS]);
  });

  it('counts an error in the first frame as a start-up failure, but not one after the loading state ended', () => {
    const page = fakePage();
    watchStartup(page.root, page.errors, page.nextFrame).finishAfterFirstFrame();
    page.runFrame();
    page.throwError();
    page.runFrame();
    expect([...page.classes]).toEqual([STARTUP_FAILED_CLASS]);

    const later = fakePage();
    watchStartup(later.root, later.errors, later.nextFrame).finishAfterFirstFrame();
    later.runFrame();
    later.runFrame();
    later.throwError();
    expect([...later.classes]).toEqual([]);
  });

  it('refuses a page that does not start in the loading state', () => {
    const page = fakePage();
    page.classes.clear();
    expect(() => watchStartup(page.root, page.errors, page.nextFrame)).toThrow(/must start with class="is-loading"/);
  });

  it('is wired up: index.html starts loading with its notes, and main.ts watches before anything else runs', () => {
    const html = readText('index.html');
    expect(html).toContain(`<html lang="en" class="${LOADING_CLASS}">`);
    for (const key of ['loading', 'startupFailed']) expect(html).toContain(`data-i18n="${key}"`);
    expect(html).toMatch(/<noscript><p class="noscript-note">[^<]+<\/p><\/noscript>/);
    expect(readText('src/main.ts').startsWith("import { startup } from './startup.ts';\n")).toBe(true);
    expect(readText('src/main.ts').trimEnd().endsWith('renderAll();\nstartup.finishAfterFirstFrame();')).toBe(true);
  });
});
