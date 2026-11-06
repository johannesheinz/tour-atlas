import { t } from '../i18n/index.ts';
import { h } from './dom.ts';
import { iconButton } from './icons.ts';

export interface UpdateNoticeView {
  /** Offers the newer build; a later offer replaces the earlier one. */
  show(apply: () => void): void;
}

/** A note at the bottom of the window that a newer build is ready; Reload asks first when it would drop the files being checked. */
export function createUpdateNotice(container: HTMLElement, confirmReload: () => boolean): UpdateNoticeView {
  let apply: (() => void) | null = null;
  const reload = h('button', { type: 'button', class: 'update-notice-reload' }, t().update.reload);
  const close = iconButton('close', t().update.later);

  reload.addEventListener('click', () => {
    if (apply === null) throw new Error('no update to apply');
    if (!confirmReload()) return;
    reload.disabled = true;
    apply();
  });
  close.addEventListener('click', () => {
    container.hidden = true;
    container.replaceChildren();
  });

  return {
    show(next) {
      apply = next;
      reload.disabled = false;
      container.replaceChildren(h('p', { class: 'update-notice-text' }, t().update.ready), reload, close);
      container.hidden = false;
    },
  };
}
