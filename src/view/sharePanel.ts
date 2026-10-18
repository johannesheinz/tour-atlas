import { t } from '../i18n/index.ts';
import type { ShareCapabilities } from '../share.ts';
import { h } from './dom.ts';
import { attachPopover } from './popover.ts';

export interface SharedView {
  readonly url: string;
  readonly title: string;
}

export interface ShareCallbacks {
  /** Asked on every open, so the link describes the view as it is now. */
  currentView(): SharedView;
}

const COPIED_FEEDBACK_MS = 2000;

/** The pop-up behind the masthead's share button: the link to the current view, a copy button and the system share sheet where there is one. */
export function createSharePanel(trigger: HTMLButtonElement, panel: HTMLElement, callbacks: ShareCallbacks, capabilities: ShareCapabilities): void {
  const text = t().share;
  let shared: SharedView | null = null;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  const field = h('input', { type: 'text', class: 'share-link', id: 'share-link', readonly: true, spellcheck: 'false', autocomplete: 'off' });
  field.addEventListener('focus', () => field.select());
  const copy = h('button', { type: 'button', class: 'button button-small' }, text.copy);
  const nativeShare = h('button', { type: 'button', class: 'button button-small', hidden: !capabilities.nativeShare }, text.share);
  const hint = h('p', { class: 'setting-note share-hint', id: 'share-hint', hidden: true }, text.copyFailed);
  const announcer = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });

  const resetFeedback = () => {
    clearTimeout(feedbackTimer);
    copy.textContent = text.copy;
    announcer.textContent = '';
    hint.hidden = true;
    field.removeAttribute('aria-describedby');
  };
  const showCopied = () => {
    resetFeedback();
    copy.textContent = text.copied;
    announcer.textContent = text.copied;
    feedbackTimer = setTimeout(resetFeedback, COPIED_FEEDBACK_MS);
  };
  const askToCopyByHand = () => {
    resetFeedback();
    hint.hidden = false;
    field.setAttribute('aria-describedby', hint.id);
    field.focus();
    field.select();
  };
  const requireShared = (): SharedView => {
    if (shared === null) throw new Error('the share panel was used before it opened');
    return shared;
  };

  attachPopover(trigger, panel, () => {
    shared = callbacks.currentView();
    field.value = shared.url;
    resetFeedback();
  });

  copy.addEventListener('click', () => {
    const { url } = requireShared();
    if (!capabilities.clipboard) {
      askToCopyByHand();
      return;
    }
    navigator.clipboard.writeText(url).then(showCopied, askToCopyByHand);
  });

  nativeShare.addEventListener('click', () => {
    const { url, title } = requireShared();
    navigator.share({ title, text: title, url }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      askToCopyByHand();
    });
  });

  panel.append(
    h('h2', { class: 'settings-title' }, text.title),
    h('p', { class: 'setting-note share-note' }, text.note),
    h('label', { class: 'share-label', for: field.id }, text.link),
    field,
    hint,
    h('div', { class: 'share-actions' }, copy, nativeShare),
    announcer,
  );
}
