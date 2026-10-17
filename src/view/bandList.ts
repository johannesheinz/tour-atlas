import { dateRange, type BandEntry, type BandSort } from '../model.ts';
import { h } from './dom.ts';
import { formatDate, plural } from './format.ts';
import { bandColor, type ThemeMode } from '../model.ts';

export interface BandListProps {
  readonly bands: readonly BandEntry[];
  readonly hiddenBandIds: ReadonlySet<string>;
  readonly filter: string;
  readonly sort: BandSort;
  readonly mode: ThemeMode;
}

export interface BandListCallbacks {
  onToggle(bandId: string, visible: boolean): void;
  onSolo(bandId: string): void;
  onShowAll(): void;
  onHideAll(): void;
  onFilter(text: string): void;
  onSort(sort: BandSort): void;
  onFocusBand(bandId: string | null): void;
}

export interface BandListView {
  render(props: BandListProps): void;
}

interface Row {
  readonly element: HTMLLIElement;
  readonly checkbox: HTMLInputElement;
  readonly name: HTMLSpanElement;
  readonly meta: HTMLSpanElement;
  readonly badge: HTMLSpanElement;
}

const SORT_LABELS: Record<BandSort, string> = { name: 'Name', 'next-show': 'Next show', 'show-count': 'Most shows' };

export function createBandList(container: HTMLElement, callbacks: BandListCallbacks): BandListView {
  const toggle = h('button', { type: 'button', class: 'band-list-toggle', 'aria-expanded': 'false', 'aria-controls': 'band-list-body' });
  const filter = h('input', { type: 'search', class: 'band-filter', placeholder: 'Filter bands', 'aria-label': 'Filter bands by name' });
  const sort = h(
    'select',
    { class: 'band-sort', 'aria-label': 'Sort bands' },
    ...Object.entries(SORT_LABELS).map(([value, label]) => h('option', { value }, label)),
  );
  const showAll = h('button', { type: 'button', class: 'text-button' }, 'Show all');
  const hideAll = h('button', { type: 'button', class: 'text-button' }, 'Hide all');
  const count = h('p', { class: 'band-count', 'aria-live': 'polite' });
  const list = h('ul', { class: 'band-rows' });
  const empty = h('p', { class: 'band-empty', hidden: true });
  const body = h(
    'div',
    { id: 'band-list-body', class: 'band-list-body' },
    h('div', { class: 'band-tools' }, filter, sort),
    h('div', { class: 'band-bulk' }, count, h('span', { class: 'band-bulk-actions' }, showAll, hideAll)),
    list,
    empty,
  );
  container.append(toggle, body);

  const rows = new Map<string, Row>();

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    container.classList.toggle('is-expanded', expanded);
  });
  filter.addEventListener('input', () => callbacks.onFilter(filter.value));
  sort.addEventListener('change', () => {
    const value = Object.keys(SORT_LABELS).find((key): key is BandSort => key === sort.value);
    if (value === undefined) throw new Error(`unknown sort ${sort.value}`);
    callbacks.onSort(value);
  });
  showAll.addEventListener('click', () => callbacks.onShowAll());
  hideAll.addEventListener('click', () => callbacks.onHideAll());
  list.addEventListener('mouseleave', () => callbacks.onFocusBand(null));
  list.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !list.contains(event.relatedTarget)) callbacks.onFocusBand(null);
  });

  function createRow(band: BandEntry): Row {
    const bandId = band.file.band.id;
    const checkbox = h('input', { type: 'checkbox', class: 'band-checkbox', id: `band-${bandId}` });
    const name = h('span', { class: 'band-name' });
    const badge = h('span', { class: 'preview-badge' }, 'Preview');
    const meta = h('span', { class: 'band-meta' });
    const solo = h('button', { type: 'button', class: 'band-solo', 'aria-label': `Show only ${band.file.band.name}` }, 'Only');
    const label = h('label', { class: 'band-label', for: checkbox.id }, h('span', { class: 'band-text' }, name, meta));
    const element = h('li', { class: 'band-row' }, checkbox, label, badge, solo);

    checkbox.addEventListener('change', () => callbacks.onToggle(bandId, checkbox.checked));
    checkbox.addEventListener('click', (event) => {
      if (!event.altKey) return;
      event.preventDefault();
      callbacks.onSolo(bandId);
    });
    solo.addEventListener('click', () => callbacks.onSolo(bandId));
    element.addEventListener('mouseenter', () => callbacks.onFocusBand(bandId));
    element.addEventListener('focusin', () => callbacks.onFocusBand(bandId));
    return { element, checkbox, name, meta, badge };
  }

  return {
    render(props) {
      const query = props.filter.trim().toLocaleLowerCase();
      const matching = props.bands.filter((band) => query === '' || band.file.band.name.toLocaleLowerCase().includes(query));
      const visibleCount = props.bands.filter((band) => !props.hiddenBandIds.has(band.file.band.id)).length;

      toggle.textContent = `Bands (${visibleCount} of ${props.bands.length} shown)`;
      count.textContent = `${visibleCount} of ${props.bands.length} shown`;
      if (filter.value !== props.filter) filter.value = props.filter;
      sort.value = props.sort;
      empty.hidden = matching.length > 0;
      empty.textContent = props.bands.length === 0 ? 'No bands yet. Drop band files here to preview them.' : `No band matches “${props.filter}”.`;

      const seen = new Set<string>();
      const ordered = matching.map((band) => {
        const bandId = band.file.band.id;
        seen.add(bandId);
        const row = rows.get(bandId) ?? createRow(band);
        rows.set(bandId, row);
        const range = dateRange(band);
        row.checkbox.checked = !props.hiddenBandIds.has(bandId);
        row.checkbox.style.setProperty('--swatch', bandColor(band, props.mode));
        row.name.textContent = band.file.band.name;
        row.meta.replaceChildren(h('span', {}, plural(band.file.shows.length, 'show')), range === null ? '' : h('span', {}, `${formatDate(range.first)} – ${formatDate(range.last)}`));
        row.badge.hidden = !band.isPreview;
        row.element.classList.toggle('is-hidden', props.hiddenBandIds.has(bandId));
        return row.element;
      });
      for (const [bandId, row] of rows) {
        if (seen.has(bandId)) continue;
        row.element.remove();
        if (!props.bands.some((band) => band.file.band.id === bandId)) rows.delete(bandId);
      }
      ordered.forEach((element, index) => {
        if (list.children[index] !== element) list.insertBefore(element, list.children[index] ?? null);
      });
    },
  };
}
