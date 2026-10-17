import type { ShowRef } from '../model.ts';
import { h, safeExternalLink } from './dom.ts';
import { countryName, formatDate, formatWeekday, plural, statusLabel } from './format.ts';
import { bandColor, type ThemeMode } from '../model.ts';

export interface DetailProps {
  /** Sorted by date. */
  readonly shows: readonly ShowRef[];
  readonly mode: ThemeMode;
  /** Set for place selections: the place name and the time range the list covers. */
  readonly place: { readonly name: string; readonly range: string } | null;
}

export interface DetailCallbacks {
  onClear(): void;
}

export interface DetailView {
  render(props: DetailProps): void;
}

const MAX_ROWS = 60;
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function createDetail(container: HTMLElement, callbacks: DetailCallbacks): DetailView {
  let previous: DetailProps | null = null;
  const announcer = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  container.after(announcer);

  return {
    render(props) {
      if (previous !== null && previous.shows === props.shows && previous.mode === props.mode && previous.place?.name === props.place?.name && previous.place?.range === props.place?.range) return;
      previous = props;
      if (props.shows.length === 0 && props.place !== null) {
        const clear = h('button', { type: 'button', class: 'text-button' }, 'Clear selection');
        clear.addEventListener('click', () => callbacks.onClear());
        container.replaceChildren(
          h('div', { class: 'detail-head' }, h('h2', { class: 'detail-title' }, props.place.name), clear),
          h('p', { class: 'detail-empty' }, `No shows here ${props.place.range}. Zoom the timeline out or pick a wider time window.`),
        );
        announcer.textContent = `${props.place.name}: no shows ${props.place.range}`;
        return;
      }
      if (props.shows.length === 0) {
        container.replaceChildren(
          h('p', { class: 'detail-empty' }, 'Select a pin on the map or a date on the timeline to see the shows here.'),
        );
        announcer.textContent = '';
        return;
      }

      const title = props.place === null ? headline(props.shows) : `${props.place.name}: ${plural(props.shows.length, 'show')}`;
      const clear = h('button', { type: 'button', class: 'text-button' }, 'Clear selection');
      clear.addEventListener('click', () => callbacks.onClear());
      const rows = props.shows.slice(0, MAX_ROWS).map((ref) => showRow(ref, props.mode));
      const overflow = props.shows.length - MAX_ROWS;

      const parts: HTMLElement[] = [
        h('div', { class: 'detail-head' }, h('h2', { class: 'detail-title' }, title), clear),
        ...(props.place === null ? [] : [h('p', { class: 'detail-range' }, `Shows ${props.place.range}, updated as you move the timeline.`)]),
        h('ol', { class: 'show-list' }, ...rows),
      ];
      if (overflow > 0) {
        parts.push(h('p', { class: 'detail-more' }, `${plural(overflow, 'more show')} not listed. Zoom in on the map to narrow the selection.`));
      }
      container.replaceChildren(...parts);
      announcer.textContent = `${title} selected`;
    },
  };
}

function headline(shows: readonly ShowRef[]): string {
  const cities = [...new Set(shows.map((ref) => ref.show.city))];
  const bands = [...new Set(shows.map((ref) => ref.band.file.band.name))];
  const [onlyCity] = cities;
  const [onlyBand] = bands;
  if (shows.length === 1 && onlyBand !== undefined && onlyCity !== undefined) return `${onlyBand} in ${onlyCity}`;
  const where = cities.length === 1 && onlyCity !== undefined ? ` in ${onlyCity}` : ` in ${plural(cities.length, 'city', 'cities')}`;
  const who = bands.length === 1 && onlyBand !== undefined ? `${onlyBand}: ` : '';
  return `${who}${plural(shows.length, 'show')}${where}`;
}

function showRow(ref: ShowRef, mode: ThemeMode): HTMLLIElement {
  const { show, band } = ref;
  const status = show.status;
  const dateText = show.endDate === null ? formatDate(show.date) : `${dayMonth.format(new Date(ref.start))} – ${formatDate(show.endDate)}`;
  const place = [show.region, countryName(show.countryCode)].filter((part) => part !== null).join(', ');

  const swatch = h('span', { class: 'detail-swatch', 'aria-hidden': 'true' });
  swatch.style.setProperty('--swatch', bandColor(band, mode));

  const facts = [
    show.eventName === null ? null : h('span', {}, show.eventName),
    show.venue === null ? h('span', { class: 'is-unknown' }, 'Venue not announced') : h('span', {}, show.venue),
    show.startTime === null ? null : h('span', {}, `Starts ${show.startTime}`),
    show.endDate === null ? null : h('span', {}, 'Day of the set not announced'),
  ].filter((fact) => fact !== null);

  const links = [
    show.ticketUrl === null ? null : safeExternalLink(show.ticketUrl, 'Tickets'),
    safeExternalLink(show.sourceUrl ?? band.file.source.url, 'Source'),
  ].filter((link) => link !== null);

  const row = h(
    'li',
    { class: `show-row${status === 'cancelled' ? ' is-cancelled' : ''}${ref.isPast ? ' is-past' : ''}` },
    h(
      'div',
      { class: 'show-when' },
      h('span', { class: 'show-weekday' }, show.endDate === null ? formatWeekday(show.date) : 'Between'),
      h('span', { class: 'show-date' }, dateText),
    ),
    h('div', { class: 'show-where' }, h('span', { class: 'show-city' }, show.city), h('span', { class: 'show-country' }, place)),
    h(
      'div',
      { class: 'show-info' },
      h('p', { class: 'show-band' }, swatch, h('strong', {}, band.file.band.name), show.tourName === null ? null : h('span', { class: 'show-tour' }, show.tourName)),
      h('p', { class: 'show-facts' }, ...facts),
      show.notes === null ? null : h('p', { class: 'show-notes' }, show.notes),
      h(
        'p',
        { class: 'show-meta' },
        statusTag(ref),
        ...links,
        h('span', { class: 'show-precision' }, show.geo.precision === 'venue' ? 'Pin at the venue' : 'Pin at the city centre'),
      ),
    ),
  );
  return row;
}

function statusTag(ref: ShowRef): HTMLSpanElement | null {
  const label = statusLabel(ref);
  if (label === null) return null;
  const tone = label === 'Played' ? 'past' : (ref.show.status ?? 'unknown');
  return h('span', { class: `status-tag status-${tone}` }, label);
}
