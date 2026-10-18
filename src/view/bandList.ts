import { dateRange, type BandEntry, type BandSort, type ShowRef } from '../model.ts';
import { createBandIdentity, type BandIdentity } from './bandIdentity.ts';
import { h } from './dom.ts';
import { withClearButton } from './searchField.ts';
import { t } from '../i18n/index.ts';
import { formatDateSpan } from './format.ts';
import { bandColor, type ThemeMode } from '../model.ts';

export interface BandListProps {
  /** Bands that pass the tag filter, in list order. */
  readonly bands: readonly BandEntry[];
  /** Each band's shows in the time range; counts and dates in the list describe only these. */
  readonly showsInRange: ReadonlyMap<BandEntry, readonly ShowRef[]>;
  /** Bands without shows in the range move into a collapsed group at the end. */
  readonly collapseBandsWithoutShows: boolean;
  readonly totalBandCount: number;
  /** Genres ticked in the Genres tab; the list then holds only their bands. */
  readonly checkedGenreCount: number;
  readonly hiddenBandIds: ReadonlySet<string>;
  readonly filter: string;
  readonly sort: BandSort;
  readonly mode: ThemeMode;
  /** Files being previewed; their panel can be reopened from the list. */
  readonly previewCount: number;
}

export interface BandListCallbacks {
  /** Opens the band's dates in the sidebar. */
  onSelect(bandId: string): void;
  onToggle(bandId: string, visible: boolean): void;
  /** Lists the dates of every shown band; offered for a handful of bands. */
  onListShown(): void;
  onOpenPreviews(): void;
  onShowAll(): void;
  onHideAll(): void;
  onFilter(text: string): void;
  onSort(sort: BandSort): void;
  onFocusBand(bandId: string | null): void;
  onClearTags(): void;
}

export interface BandListView {
  render(props: BandListProps): void;
}

interface Row {
  readonly element: HTMLLIElement;
  readonly checkbox: HTMLInputElement;
  readonly select: HTMLButtonElement;
  readonly identity: BandIdentity;
  readonly meta: HTMLSpanElement;
  readonly badge: HTMLSpanElement;
}

const MAX_LISTABLE_BANDS = 10;

const SORTS: readonly BandSort[] = ['name', 'next-show', 'show-count'];

export function createBandList(container: HTMLElement, callbacks: BandListCallbacks): BandListView {
  const filter = h('input', { type: 'search', class: 'band-filter', placeholder: t().bandList.filter, 'aria-label': t().bandList.filterLabel });
  const sort = h(
    'select',
    { class: 'band-sort', 'aria-label': t().bandList.sortLabel },
    ...SORTS.map((value) => h('option', { value }, t().bandList.sorts[value])),
  );
  const showAll = h('button', { type: 'button', class: 'text-button' }, t().bandList.showAll);
  const hideAll = h('button', { type: 'button', class: 'text-button' }, t().bandList.hideAll);
  const count = h('p', { class: 'band-count', 'aria-live': 'polite' });
  const openPreviews = h('button', { type: 'button', class: 'text-button band-previews', hidden: true });
  const listShown = h('button', { type: 'button', class: 'button button-small band-list-shown', hidden: true }, t().bandList.listShown);
  const clearTags = h('button', { type: 'button', class: 'text-button' }, t().bandList.showAllGenres);
  clearTags.addEventListener('click', () => callbacks.onClearTags());
  const genreNote = h('p', { class: 'genre-note', hidden: true }, h('span', {}), clearTags);
  const list = h('ul', { class: 'band-rows' });
  const empty = h('p', { class: 'band-empty', hidden: true });
  const body = h(
    'div',
    { id: 'band-list-body', class: 'band-list-body' },
    openPreviews,
    h('div', { class: 'band-tools' }, withClearButton(filter, t().bandList.clearFilter), sort),
    genreNote,
    h('div', { class: 'band-bulk' }, count, listShown, h('span', { class: 'band-bulk-actions' }, showAll, hideAll)),
    list,
    empty,
  );
  container.append(body);

  const rows = new Map<string, Row>();
  let quietOpen = false;
  let lastProps: BandListProps | null = null;
  const quietButton = h('button', { type: 'button', class: 'text-button band-quiet-toggle', 'aria-expanded': 'false' });
  const quietRow = h('li', { class: 'band-quiet' }, quietButton);
  quietButton.addEventListener('click', () => {
    quietOpen = !quietOpen;
    if (lastProps !== null) render(lastProps);
  });

  filter.addEventListener('input', () => callbacks.onFilter(filter.value));
  sort.addEventListener('change', () => {
    const value = SORTS.find((key) => key === sort.value);
    if (value === undefined) throw new Error(`unknown sort ${sort.value}`);
    callbacks.onSort(value);
  });
  showAll.addEventListener('click', () => callbacks.onShowAll());
  listShown.addEventListener('click', () => callbacks.onListShown());
  openPreviews.addEventListener('click', () => callbacks.onOpenPreviews());
  hideAll.addEventListener('click', () => callbacks.onHideAll());
  list.addEventListener('mouseleave', () => callbacks.onFocusBand(null));
  list.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !list.contains(event.relatedTarget)) callbacks.onFocusBand(null);
  });

  function createRow(band: BandEntry): Row {
    const bandId = band.file.band.id;
    const checkbox = h('input', { type: 'checkbox', class: 'band-checkbox', 'aria-label': t().bandList.showOnMap(band.file.band.name) });
    const badge = h('span', { class: 'preview-badge' }, t().bandList.previewBadge);
    const meta = h('span', { class: 'band-meta' });
    const identity = createBandIdentity('is-band-row');
    const select = h('button', { type: 'button', class: 'band-select', 'aria-label': t().bandList.listDates(band.file.band.name) }, identity.element, meta);
    const element = h('li', { class: 'band-row' }, checkbox, select, badge);

    select.addEventListener('click', () => callbacks.onSelect(bandId));
    checkbox.addEventListener('change', () => callbacks.onToggle(bandId, checkbox.checked));
    element.addEventListener('mouseenter', () => callbacks.onFocusBand(bandId));
    element.addEventListener('focusin', () => callbacks.onFocusBand(bandId));
    return { element, checkbox, select, identity, meta, badge };
  }

  function render(props: BandListProps) {
    lastProps = props;
    const query = props.filter.trim().toLocaleLowerCase();
    const matching = props.bands.filter((band) => query === '' || band.file.band.name.toLocaleLowerCase().includes(query));
    const visibleCount = props.bands.filter((band) => !props.hiddenBandIds.has(band.file.band.id)).length;

    count.textContent = t().bandList.shownCount(visibleCount, props.totalBandCount);
    listShown.hidden = visibleCount < 2 || visibleCount > MAX_LISTABLE_BANDS;
    openPreviews.hidden = props.previewCount === 0;
    openPreviews.textContent = t().bandList.openPreviews(props.previewCount);
    listShown.setAttribute('aria-label', t().bandList.listShownLabel(visibleCount));
    genreNote.hidden = props.checkedGenreCount === 0;
    const genreText = genreNote.firstElementChild;
    if (genreText !== null) genreText.textContent = `${t().bandList.tickedGenres(props.checkedGenreCount)} `;
    if (filter.value !== props.filter) filter.value = props.filter;
    sort.value = props.sort;
    empty.hidden = matching.length > 0;
    empty.textContent =
      props.totalBandCount === 0
        ? t().bandList.noBands
        : props.bands.length === 0
          ? t().bandList.noBandForGenres
          : t().bandList.noMatch(props.filter);

    const rowFor = (band: BandEntry): HTMLLIElement => {
      const bandId = band.file.band.id;
      const row = rows.get(bandId) ?? createRow(band);
      rows.set(bandId, row);
      const refs = props.showsInRange.get(band) ?? [];
      const range = dateRange(refs);
      row.checkbox.checked = !props.hiddenBandIds.has(bandId);
      row.checkbox.style.setProperty('--swatch', bandColor(band, props.mode));
      row.identity.update(bandId, band.file.band.name);
      row.meta.replaceChildren(
        h('span', {}, refs.length === 0 ? t().noShowsInRange : t().shows(refs.length)),
        range === null ? '' : h('span', {}, formatDateSpan(range.first, range.first === range.last ? null : range.last)),
      );
      row.badge.hidden = !band.isPreview;
      row.element.classList.toggle('is-hidden', props.hiddenBandIds.has(bandId));
      row.element.classList.toggle('is-quiet', refs.length === 0);
      return row.element;
    };
    const playing = matching.filter((band) => (props.showsInRange.get(band) ?? []).length > 0);
    const quiet = matching.filter((band) => (props.showsInRange.get(band) ?? []).length === 0);
    const collapse = props.collapseBandsWithoutShows && quiet.length > 0;
    quietButton.textContent = t().bandList.quietToggle(quietOpen, quiet.length);
    quietButton.setAttribute('aria-expanded', String(quietOpen));
    const displayed = collapse
      ? [...playing.map(rowFor), quietRow, ...(quietOpen ? quiet.map(rowFor) : [])]
      : matching.map(rowFor);

    const keep = new Set<Element>(displayed);
    for (const child of [...list.children]) if (!keep.has(child)) child.remove();
    for (const bandId of rows.keys()) if (!props.bands.some((band) => band.file.band.id === bandId)) rows.delete(bandId);
    displayed.forEach((element, index) => {
      if (list.children[index] !== element) list.insertBefore(element, list.children[index] ?? null);
    });
  }

  return { render };
}
