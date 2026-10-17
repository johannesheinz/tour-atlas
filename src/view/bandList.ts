import { dateRange, type BandEntry, type BandSort, type ShowRef } from '../model.ts';
import { TAG_VOCABULARY } from '../data/tags.ts';
import { createBandIdentity, type BandIdentity } from './bandIdentity.ts';
import { h } from './dom.ts';
import { withClearButton } from './searchField.ts';
import { formatDate, plural } from './format.ts';
import { bandColor, type ThemeMode } from '../model.ts';

export interface BandListProps {
  /** Bands that pass the tag filter, in list order. */
  readonly bands: readonly BandEntry[];
  /** Each band's shows in the time range; counts and dates in the list describe only these. */
  readonly showsInRange: ReadonlyMap<BandEntry, readonly ShowRef[]>;
  /** Bands without shows in the range move into a collapsed group at the end. */
  readonly collapseBandsWithoutShows: boolean;
  readonly totalBandCount: number;
  readonly tagFilter: ReadonlySet<string>;
  /** Bands per tag across all bands; tags without bands get no chip. */
  readonly tagCounts: ReadonlyMap<string, number>;
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
  onSolo(bandId: string): void;
  /** Lists the dates of every shown band; offered for a handful of bands. */
  onListShown(): void;
  onOpenPreviews(): void;
  onShowAll(): void;
  onHideAll(): void;
  onFilter(text: string): void;
  onSort(sort: BandSort): void;
  onFocusBand(bandId: string | null): void;
  onToggleTag(tagId: string): void;
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

const SORT_LABELS: Record<BandSort, string> = { name: 'Name', 'next-show': 'Next show', 'show-count': 'Most shows' };

export function createBandList(container: HTMLElement, callbacks: BandListCallbacks): BandListView {
  const filter = h('input', { type: 'search', class: 'band-filter', placeholder: 'Filter bands', 'aria-label': 'Filter bands by name' });
  const sort = h(
    'select',
    { class: 'band-sort', 'aria-label': 'Sort bands' },
    ...Object.entries(SORT_LABELS).map(([value, label]) => h('option', { value }, label)),
  );
  const showAll = h('button', { type: 'button', class: 'text-button' }, 'Show all');
  const hideAll = h('button', { type: 'button', class: 'text-button' }, 'Hide all');
  const count = h('p', { class: 'band-count', 'aria-live': 'polite' });
  const openPreviews = h('button', { type: 'button', class: 'text-button band-previews', hidden: true });
  const listShown = h('button', { type: 'button', class: 'button button-small band-list-shown', hidden: true }, 'List their dates');
  const tagChips = new Map(
    TAG_VOCABULARY.tags.map((tag) => {
      const chip = h('button', { type: 'button', class: 'tag-chip', 'aria-pressed': 'false' }, h('span', {}, tag.label), h('span', { class: 'tag-count' }));
      chip.addEventListener('click', () => callbacks.onToggleTag(tag.id));
      return [tag.id, chip] as const;
    }),
  );
  const tagGroups = TAG_VOCABULARY.groups.map((group) => {
    const chips = TAG_VOCABULARY.tags.filter((tag) => tag.group === group.id).flatMap((tag) => tagChips.get(tag.id) ?? []);
    const element = h('div', { class: 'tag-group', role: 'group', 'aria-label': group.label }, h('span', { class: 'tag-group-label' }, group.label), ...chips);
    return { element, tagIds: TAG_VOCABULARY.tags.filter((tag) => tag.group === group.id).map((tag) => tag.id) };
  });
  const clearTags = h('button', { type: 'button', class: 'text-button' }, 'Clear tags');
  clearTags.addEventListener('click', () => callbacks.onClearTags());
  const tagNote = h('p', { class: 'tag-note', hidden: true });
  const tagSummary = h('summary', { class: 'tag-summary' });
  const tagFilter = h(
    'details',
    { class: 'tag-filter' },
    tagSummary,
    h('div', { class: 'tag-groups' }, ...tagGroups.map((group) => group.element), h('div', { class: 'tag-actions' }, tagNote, clearTags)),
  );
  const list = h('ul', { class: 'band-rows' });
  const empty = h('p', { class: 'band-empty', hidden: true });
  const body = h(
    'div',
    { id: 'band-list-body', class: 'band-list-body' },
    openPreviews,
    h('div', { class: 'band-tools' }, withClearButton(filter, 'Clear the band filter'), sort),
    tagFilter,
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
    const value = Object.keys(SORT_LABELS).find((key): key is BandSort => key === sort.value);
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
    const checkbox = h('input', { type: 'checkbox', class: 'band-checkbox', 'aria-label': `Show ${band.file.band.name} on the map and timeline` });
    const badge = h('span', { class: 'preview-badge' }, 'Preview');
    const meta = h('span', { class: 'band-meta' });
    const identity = createBandIdentity('is-band-row');
    const solo = h('button', { type: 'button', class: 'band-solo', 'aria-label': `Show only ${band.file.band.name}` }, 'Only');
    const select = h('button', { type: 'button', class: 'band-select', 'aria-label': `List the dates of ${band.file.band.name}` }, identity.element, meta);
    const element = h('li', { class: 'band-row' }, checkbox, select, badge, solo);

    select.addEventListener('click', () => callbacks.onSelect(bandId));
    checkbox.addEventListener('change', () => callbacks.onToggle(bandId, checkbox.checked));
    checkbox.addEventListener('click', (event) => {
      if (!event.altKey) return;
      event.preventDefault();
      callbacks.onSolo(bandId);
    });
    solo.addEventListener('click', () => callbacks.onSolo(bandId));
    element.addEventListener('mouseenter', () => callbacks.onFocusBand(bandId));
    element.addEventListener('focusin', () => callbacks.onFocusBand(bandId));
    return { element, checkbox, select, identity, meta, badge };
  }

  function render(props: BandListProps) {
    lastProps = props;
    const query = props.filter.trim().toLocaleLowerCase();
    const matching = props.bands.filter((band) => query === '' || band.file.band.name.toLocaleLowerCase().includes(query));
    const visibleCount = props.bands.filter((band) => !props.hiddenBandIds.has(band.file.band.id)).length;

    count.textContent = `${visibleCount} of ${props.totalBandCount} shown`;
    listShown.hidden = visibleCount < 2 || visibleCount > MAX_LISTABLE_BANDS;
    openPreviews.hidden = props.previewCount === 0;
    openPreviews.textContent = `Open ${plural(props.previewCount, 'previewed file')}`;
    listShown.setAttribute('aria-label', `List the dates of the ${visibleCount} shown bands`);
    for (const [tagId, chip] of tagChips) {
      const bands = props.tagCounts.get(tagId) ?? 0;
      chip.hidden = bands === 0;
      chip.setAttribute('aria-pressed', String(props.tagFilter.has(tagId)));
      const countLabel = chip.lastElementChild;
      if (countLabel !== null) countLabel.textContent = String(bands);
    }
    for (const group of tagGroups) group.element.hidden = group.tagIds.every((tagId) => (props.tagCounts.get(tagId) ?? 0) === 0);
    tagFilter.hidden = props.tagCounts.size === 0;
    tagSummary.textContent = props.tagFilter.size === 0 ? 'Filter by genre' : `Filter by genre (${props.tagFilter.size} selected)`;
    const filteredOut = props.totalBandCount - props.bands.length;
    clearTags.hidden = props.tagFilter.size === 0;
    tagNote.hidden = filteredOut === 0;
    tagNote.textContent = `${filteredOut} ${filteredOut === 1 ? 'band does' : 'bands do'} not match the tags.`;
    if (filter.value !== props.filter) filter.value = props.filter;
    sort.value = props.sort;
    empty.hidden = matching.length > 0;
    empty.textContent =
      props.totalBandCount === 0
        ? 'No bands yet. Drop band files here to preview them.'
        : props.bands.length === 0
          ? 'No band has all the selected tags. Clear a tag to see more.'
          : `No band matches “${props.filter}”.`;

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
        h('span', {}, refs.length === 0 ? 'No shows in this time range' : plural(refs.length, 'show')),
        range === null ? '' : h('span', {}, range.first === range.last ? formatDate(range.first) : `${formatDate(range.first)} – ${formatDate(range.last)}`),
      );
      row.badge.hidden = !band.isPreview;
      row.element.classList.toggle('is-hidden', props.hiddenBandIds.has(bandId));
      row.element.classList.toggle('is-quiet', refs.length === 0);
      return row.element;
    };
    const playing = matching.filter((band) => (props.showsInRange.get(band) ?? []).length > 0);
    const quiet = matching.filter((band) => (props.showsInRange.get(band) ?? []).length === 0);
    const collapse = props.collapseBandsWithoutShows && quiet.length > 0;
    quietButton.textContent = `${quietOpen ? 'Hide' : 'Show'} ${plural(quiet.length, 'band')} without shows in this time range`;
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
