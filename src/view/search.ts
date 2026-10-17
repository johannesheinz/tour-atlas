import { h } from './dom.ts';
import { SEARCH_KIND_LABELS, searchEntries, type SearchEntry } from './searchIndex.ts';

export interface SearchCallbacks {
  onChoose(entry: SearchEntry): void;
}

export interface SearchView {
  setIndex(index: readonly SearchEntry[]): void;
}

const RESULTS_PER_KIND = 5;

/** ARIA 1.2 combobox with a grouped listbox. */
export function createSearch(container: HTMLElement, callbacks: SearchCallbacks): SearchView {
  const input = h('input', {
    type: 'search',
    class: 'search-input',
    id: 'search-input',
    role: 'combobox',
    'aria-expanded': 'false',
    'aria-controls': 'search-results',
    'aria-autocomplete': 'list',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'Search bands, cities, venues, tours',
  });
  const label = h('label', { class: 'visually-hidden', for: 'search-input' }, 'Search bands, cities, venues and tours');
  const listbox = h('ul', { class: 'search-results', id: 'search-results', role: 'listbox', 'aria-label': 'Search results', hidden: true });
  const status = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  container.append(label, input, listbox, status);

  let index: readonly SearchEntry[] = [];
  let results: SearchEntry[] = [];
  let active = -1;

  const open = (isOpen: boolean) => {
    listbox.hidden = !isOpen;
    input.setAttribute('aria-expanded', String(isOpen));
    if (!isOpen) {
      active = -1;
      input.removeAttribute('aria-activedescendant');
    }
  };

  const update = () => {
    results = searchEntries(index, input.value, RESULTS_PER_KIND);
    active = -1;
    input.removeAttribute('aria-activedescendant');
    const items: HTMLLIElement[] = [];
    let previousKind: SearchEntry['kind'] | null = null;
    results.forEach((entry, position) => {
      if (entry.kind !== previousKind) {
        items.push(h('li', { class: 'search-group', role: 'presentation' }, SEARCH_KIND_LABELS[entry.kind]));
        previousKind = entry.kind;
      }
      const option = h(
        'li',
        { class: 'search-option', role: 'option', id: `search-option-${position}`, 'aria-selected': 'false' },
        h('span', { class: 'search-option-label' }, entry.label),
        h('span', { class: 'search-option-detail' }, entry.detail),
      );
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => choose(position));
      items.push(option);
    });
    if (results.length === 0 && input.value.trim() !== '') {
      items.push(h('li', { class: 'search-empty', role: 'presentation' }, `Nothing matches “${input.value.trim()}”.`));
    }
    listbox.replaceChildren(...items);
    status.textContent = input.value.trim() === '' ? '' : `${results.length} results`;
    open(input.value.trim() !== '');
  };

  const highlight = (position: number) => {
    active = position;
    for (const option of listbox.querySelectorAll('[role="option"]')) {
      const selected = option.id === `search-option-${position}`;
      option.setAttribute('aria-selected', String(selected));
      if (selected) option.scrollIntoView({ block: 'nearest' });
    }
    input.setAttribute('aria-activedescendant', `search-option-${position}`);
  };

  const choose = (position: number) => {
    const entry = results[position];
    if (entry === undefined) return;
    input.value = entry.label;
    open(false);
    callbacks.onChoose(entry);
  };

  input.addEventListener('input', update);
  input.addEventListener('focus', () => {
    if (input.value.trim() !== '') update();
  });
  input.addEventListener('blur', () => open(false));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (listbox.hidden) update();
      if (results.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlight((active + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      if (listbox.hidden || results.length === 0) return;
      event.preventDefault();
      choose(active === -1 ? 0 : active);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      if (!listbox.hidden) open(false);
      else input.value = '';
    }
  });

  return {
    setIndex(next) {
      index = next;
      if (!listbox.hidden) update();
    },
  };
}
