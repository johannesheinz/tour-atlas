import { t } from '../i18n/index.ts';
import type { GenreSummary } from '../selectors.ts';
import { h } from './dom.ts';
import { withClearButton } from './searchField.ts';
import { foldForSearch } from './searchIndex.ts';

export interface GenreListProps {
  readonly genres: readonly GenreSummary[];
  /** Checked genres narrow the map and timeline to their bands. */
  readonly checked: ReadonlySet<string>;
}

export interface GenreListCallbacks {
  onToggle(genreId: string): void;
  onClearChecked(): void;
  /** Opens the genre's dates in the sidebar. */
  onSelect(genreId: string): void;
}

export interface GenreListView {
  render(props: GenreListProps): void;
}

/** The Genres tab: like the band list, a checkbox shows or hides a genre's bands and the name lists its dates. */
export function createGenreList(container: HTMLElement, callbacks: GenreListCallbacks): GenreListView {
  const filter = h('input', { type: 'search', class: 'genre-filter', placeholder: t().genreList.filter, 'aria-label': t().genreList.filter });
  const note = h('p', { class: 'band-count', 'aria-live': 'polite' });
  const clear = h('button', { type: 'button', class: 'text-button', hidden: true }, t().genreList.showAll);
  clear.addEventListener('click', () => callbacks.onClearChecked());
  const list = h('ul', { class: 'genre-rows' });
  const empty = h('p', { class: 'band-empty', hidden: true });
  container.append(withClearButton(filter, t().genreList.clearFilter), h('div', { class: 'band-bulk' }, note, clear), list, empty);

  let props: GenreListProps | null = null;
  filter.addEventListener('input', () => {
    if (props !== null) draw(props);
  });

  function draw(current: GenreListProps) {
    const query = foldForSearch(filter.value);
    const matching = current.genres.filter((genre) => query === '' || foldForSearch(genre.label).includes(query));
    note.textContent = current.checked.size === 0 ? t().genreList.hint : t().genreList.showing(current.checked.size);
    clear.hidden = current.checked.size === 0;
    empty.hidden = matching.length > 0;
    empty.textContent = t().genreList.noMatch(filter.value.trim());
    list.replaceChildren(
      ...matching.map((genre) => {
        const checkbox = h('input', { type: 'checkbox', class: 'genre-checkbox', 'aria-label': t().genreList.showOnMap(genre.label) });
        checkbox.checked = current.checked.has(genre.id);
        checkbox.addEventListener('change', () => callbacks.onToggle(genre.id));
        const counts = genre.showCount === 0 ? t().noShowsInRange : t().genreList.bandsAndShows(genre.bandCount, genre.showCount);
        const select = h(
          'button',
          { type: 'button', class: 'genre-select', 'aria-label': t().genreList.listDates(genre.label), 'data-row-key': genre.id },
          h('span', { class: 'genre-name' }, genre.label),
          h('span', { class: 'band-meta' }, counts),
        );
        select.addEventListener('click', () => callbacks.onSelect(genre.id));
        return h('li', { class: `genre-row${genre.showCount === 0 ? ' is-quiet' : ''}` }, checkbox, select);
      }),
    );
  }

  return {
    render(next) {
      if (props !== null && props.genres === next.genres && props.checked === next.checked) return;
      props = next;
      draw(next);
    },
  };
}
