/**
 * index.html starts in the loading state: only the header and a loading note show (src/styles.css). An error
 * before the first view is drawn swaps the note for a start-up error and keeps it; the console has the details.
 * DOM-free, so it is testable in Node; src/startup.ts applies it to the page.
 */
export const LOADING_CLASS = 'is-loading';
export const STARTUP_FAILED_CLASS = 'has-startup-error';

export interface RootClasses {
  contains(token: string): boolean;
  remove(token: string): void;
  replace(token: string, newToken: string): boolean;
}

export interface ErrorEvents {
  addEventListener(type: 'error', listener: () => void): void;
  removeEventListener(type: 'error', listener: () => void): void;
}

export interface StartupWatch {
  /**
   * Ends the loading state after the first render has been through a frame: the map and timeline size themselves
   * in that frame (ResizeObserver), so ending it in the next one shows the settled layout instead of a jump.
   */
  finishAfterFirstFrame(): void;
}

export function watchStartup(root: RootClasses, errors: ErrorEvents, nextFrame: (callback: () => void) => void): StartupWatch {
  if (!root.contains(LOADING_CLASS)) throw new Error(`index.html must start with class="${LOADING_CLASS}" on <html>`);
  const showFailure = () => root.replace(LOADING_CLASS, STARTUP_FAILED_CLASS);
  errors.addEventListener('error', showFailure);
  let finishing = false;

  const finish = () => {
    errors.removeEventListener('error', showFailure);
    if (root.contains(STARTUP_FAILED_CLASS)) return;
    root.remove(LOADING_CLASS);
  };

  return {
    finishAfterFirstFrame() {
      if (finishing) throw new Error('the loading state is already ending');
      finishing = true;
      nextFrame(() => nextFrame(finish));
    },
  };
}
