import { t } from './i18n/index.ts';
import { parseUrlState, serializeUrlState } from './urlState.ts';

export interface ShareCapabilities {
  readonly clipboard: boolean;
  readonly nativeShare: boolean;
}

/** The parts of `navigator` sharing looks at, so tests can pass a plain object. */
export interface NavigatorLike {
  readonly share?: unknown;
  readonly clipboard?: { readonly writeText?: unknown };
}

/**
 * The page's address with the given view hash. Language, clock and distance unit are left out, so the
 * person who opens the link sees it in their own settings.
 */
export function shareLink(pageHref: string, hash: string): string {
  const sharedHash = serializeUrlState({ ...parseUrlState(hash), language: null, clock: null, distance: null });
  return new URL(sharedHash, pageHref).href;
}

export function shareText(heading: string | null): string {
  return heading === null ? t().share.siteTitle : t().share.titleFor(heading);
}

export function shareCapabilities(navigatorLike: NavigatorLike): ShareCapabilities {
  return {
    clipboard: typeof navigatorLike.clipboard?.writeText === 'function',
    nativeShare: typeof navigatorLike.share === 'function',
  };
}
