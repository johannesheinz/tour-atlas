import { watchStartup } from './loadingState.ts';

/** main.ts imports this module first, so the error listener is in place before any other module runs. */
export const startup = watchStartup(document.documentElement.classList, window, (callback) => requestAnimationFrame(callback));
