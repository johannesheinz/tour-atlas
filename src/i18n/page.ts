import { currentLocale, t } from './index.ts';
import type { Messages } from './messages.ts';

export type PageText = Exclude<keyof Messages['page'], 'sidebarToggle'>;

/** Translates the static markup: data-i18n sets the text, data-i18n-label the aria-label, data-i18n-title the title. */
export function localizePage(root: Document): void {
  root.documentElement.lang = currentLocale().tag;
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) element.textContent = pageText(element.dataset['i18n']);
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-label]')) element.setAttribute('aria-label', pageText(element.dataset['i18nLabel']));
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) element.title = pageText(element.dataset['i18nTitle']);
}

export function isPageText(key: string): key is PageText {
  return key !== 'sidebarToggle' && Object.hasOwn(t().page, key);
}

function pageText(key: string | undefined): string {
  if (key === undefined || !isPageText(key)) throw new Error(`index.html names an unknown text "${key ?? ''}"`);
  return t().page[key];
}
