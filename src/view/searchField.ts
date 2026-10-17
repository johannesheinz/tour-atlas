import { h } from './dom.ts';

/** Wraps a search input with an "x" that clears it; CSS hides the button while the input shows its placeholder. */
export function withClearButton(input: HTMLInputElement, label: string): HTMLSpanElement {
  const clear = h('button', { type: 'button', class: 'search-clear', 'aria-label': label });
  clear.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  return h('span', { class: 'search-field' }, input, clear);
}
