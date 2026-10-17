import { bandColor, type ShowRef, type ThemeMode } from '../model.ts';
import { bandIdentity } from './bandIdentity.ts';
import { h, safeExternalLink } from './dom.ts';
import { countryName, formatDate, formatWeekday, plural, statusLabel } from './format.ts';

export interface SelectionHeading {
  readonly title: string;
  /** Set for a band selection: the heading leads with the band's logo. */
  readonly bandId: string | null;
  readonly note: string | null;
  readonly emptyMessage: string;
}

export interface SelectionPanelProps {
  readonly heading: SelectionHeading;
  /** Sorted by date. */
  readonly shows: readonly ShowRef[];
  /** False when every row is the same band, which the heading already names. */
  readonly showBand: boolean;
  readonly backLabel: string;
  readonly mode: ThemeMode;
}

export interface SelectionPanelCallbacks {
  onBack(): void;
}

export interface SelectionPanelView {
  render(props: SelectionPanelProps): void;
  focusTitle(): void;
}

const MAX_ROWS = 100;
const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The shows of the current selection, listed in the sidebar in place of the band and place lists. */
export function createSelectionPanel(container: HTMLElement, callbacks: SelectionPanelCallbacks): SelectionPanelView {
  const back = h('button', { type: 'button', class: 'selection-back' });
  back.addEventListener('click', () => callbacks.onBack());
  const title = h('h2', { class: 'selection-title', tabindex: '-1' });
  const note = h('p', { class: 'selection-note' });
  const body = h('div', { class: 'selection-body' });
  const announcer = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  container.append(back, h('div', { class: 'selection-head' }, title, note), body, announcer);
  let previous: SelectionPanelProps | null = null;

  return {
    render(props) {
      if (previous !== null && previous.shows === props.shows && previous.mode === props.mode && previous.backLabel === props.backLabel && sameHeading(previous.heading, props.heading)) return;
      const headingChanged = previous === null || !sameHeading(previous.heading, props.heading);
      previous = props;
      back.textContent = props.backLabel;
      const { heading } = props;
      title.replaceChildren(heading.bandId === null ? heading.title : bandIdentity(heading.bandId, heading.title, 'is-heading'));
      note.textContent = heading.note ?? '';
      note.hidden = heading.note === null;

      if (props.shows.length === 0) {
        body.replaceChildren(h('p', { class: 'selection-empty' }, heading.emptyMessage));
      } else {
        const listed = props.shows.slice(0, MAX_ROWS);
        const overflow = props.shows.length - listed.length;
        body.replaceChildren(
          ...monthGroups(listed).map(([month, refs]) =>
            h('section', { class: 'selection-month' }, h('h3', { class: 'selection-month-title' }, month), h('ol', { class: 'gig-list' }, ...refs.map((ref) => gigRow(ref, props)))),
          ),
          ...(overflow > 0 ? [h('p', { class: 'selection-more' }, `${plural(overflow, 'more show')} not listed. Narrow the time range on the timeline.`)] : []),
        );
      }
      if (headingChanged) {
        announcer.textContent = `${heading.title}: ${plural(props.shows.length, 'show')}`;
      }
    },
    focusTitle: () => title.focus(),
  };
}

function sameHeading(a: SelectionHeading, b: SelectionHeading): boolean {
  return a.title === b.title && a.bandId === b.bandId && a.note === b.note && a.emptyMessage === b.emptyMessage;
}

function monthGroups(shows: readonly ShowRef[]): [string, ShowRef[]][] {
  const groups = new Map<string, ShowRef[]>();
  for (const ref of shows) {
    const month = monthFormat.format(new Date(ref.start));
    groups.set(month, [...(groups.get(month) ?? []), ref]);
  }
  return [...groups];
}

function gigRow(ref: ShowRef, props: SelectionPanelProps): HTMLLIElement {
  const { show, band } = ref;
  const swatch = h('span', { class: 'gig-swatch', 'aria-hidden': 'true' });
  swatch.style.setProperty('--swatch', bandColor(band, props.mode));

  const facts = [
    show.eventName === null ? null : h('span', {}, show.eventName),
    show.venue === null ? h('span', { class: 'is-unknown' }, 'Venue not announced') : h('span', {}, show.venue),
    show.startTime === null ? null : h('span', {}, `Starts ${show.startTime}`),
    show.endDate === null ? null : h('span', {}, `Until ${formatDate(show.endDate)}, day of the set not announced`),
  ].filter((fact) => fact !== null);
  const links = [show.ticketUrl === null ? null : safeExternalLink(show.ticketUrl, 'Tickets'), safeExternalLink(show.sourceUrl ?? band.file.source.url, 'Source')].filter(
    (link) => link !== null,
  );
  const status = statusLabel(ref);

  return h(
    'li',
    { class: `gig${show.status === 'cancelled' ? ' is-cancelled' : ''}${ref.isPast ? ' is-past' : ''}` },
    h('p', { class: 'gig-day' }, h('span', { class: 'gig-date' }, String(new Date(ref.start).getUTCDate())), h('span', { class: 'gig-weekday' }, formatWeekday(show.date))),
    h(
      'div',
      { class: 'gig-info' },
      h('p', { class: 'gig-place' }, h('span', { class: 'gig-city' }, show.city), h('span', { class: 'gig-country' }, [show.region, countryName(show.countryCode)].filter((part) => part !== null).join(', '))),
      props.showBand ? h('p', { class: 'gig-band' }, swatch, bandIdentity(band.file.band.id, band.file.band.name, 'is-gig'), show.tourName === null ? null : h('span', { class: 'gig-tour' }, show.tourName)) : null,
      !props.showBand && show.tourName !== null ? h('p', { class: 'gig-tour' }, show.tourName) : null,
      h('p', { class: 'gig-facts' }, ...facts),
      show.notes === null ? null : h('p', { class: 'gig-notes' }, show.notes),
      h(
        'p',
        { class: 'gig-meta' },
        status === null ? null : h('span', { class: `status-tag status-${status === 'Played' ? 'past' : (show.status ?? 'unknown')}` }, status),
        ...links,
        h('span', { class: 'gig-precision' }, show.geo.precision === 'venue' ? 'Pin at the venue' : 'Pin at the city centre'),
      ),
    ),
  );
}
