import { bandColor, type ShowRef, type ThemeMode } from '../model.ts';
import { bandIdentity } from './bandIdentity.ts';
import { iconButton } from './icons.ts';
import { h, prefersReducedMotion, safeExternalLink } from './dom.ts';
import { formats, t } from '../i18n/index.ts';
import { countryName, formatDate, formatTime, formatWeekday, statusKind } from './format.ts';

export interface SelectionHeading {
  readonly title: string;
  /** Set for a band selection: the heading leads with the band's logo. */
  readonly bandId: string | null;
  readonly note: string | null;
  readonly emptyMessage: string;
  /** Band views can play their tour again. */
  readonly canReplayTour: boolean;
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
  /** Hovering or focusing a row points the map and timeline at that show; null when it leaves. */
  onHover(ref: ShowRef | null): void;
  onReplayTour(): void;
}

export interface SelectionPanelView {
  render(props: SelectionPanelProps): void;
  /** Marks the rows of shows hovered on the map or timeline, and scrolls the first into view if needed. */
  highlight(showIds: ReadonlySet<string>): void;
  focusTitle(): void;
}

const MAX_ROWS = 100;

/** The shows of the current selection, listed in the sidebar in place of the band and place lists. */
export function createSelectionPanel(container: HTMLElement, callbacks: SelectionPanelCallbacks): SelectionPanelView {
  const back = h('button', { type: 'button', class: 'selection-back' });
  back.addEventListener('click', () => callbacks.onBack());
  const title = h('h2', { class: 'selection-title', tabindex: '-1' });
  const replay = iconButton('play', t().selection.replayTour);
  replay.classList.add('selection-replay');
  replay.addEventListener('click', () => callbacks.onReplayTour());
  const note = h('p', { class: 'selection-note' });
  const body = h('div', { class: 'selection-body' });
  const announcer = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  container.append(back, h('div', { class: 'selection-head' }, h('div', { class: 'selection-title-row' }, title, replay), note), body, announcer);
  let previous: SelectionPanelProps | null = null;
  let rowsByShowId = new Map<string, HTMLLIElement>();
  let highlighted: readonly HTMLLIElement[] = [];

  return {
    render(props) {
      if (previous !== null && previous.shows === props.shows && previous.mode === props.mode && previous.backLabel === props.backLabel && sameHeading(previous.heading, props.heading)) return;
      const headingChanged = previous === null || !sameHeading(previous.heading, props.heading);
      previous = props;
      back.textContent = props.backLabel;
      const { heading } = props;
      title.replaceChildren(heading.bandId === null ? heading.title : bandIdentity(heading.bandId, heading.title, 'is-heading'));
      replay.hidden = !heading.canReplayTour;
      note.textContent = heading.note ?? '';
      note.hidden = heading.note === null;

      if (props.shows.length === 0) {
        body.replaceChildren(h('p', { class: 'selection-empty' }, heading.emptyMessage));
      } else {
        const listed = props.shows.slice(0, MAX_ROWS);
        const overflow = props.shows.length - listed.length;
        rowsByShowId = new Map();
        highlighted = [];
        const row = (ref: ShowRef) => {
          const element = gigRow(ref, props);
          element.addEventListener('mouseenter', () => callbacks.onHover(ref));
          element.addEventListener('mouseleave', () => callbacks.onHover(null));
          element.addEventListener('focusin', () => callbacks.onHover(ref));
          element.addEventListener('focusout', (event) => {
            if (!(event.relatedTarget instanceof Node) || !element.contains(event.relatedTarget)) callbacks.onHover(null);
          });
          rowsByShowId.set(ref.show.id, element);
          return element;
        };
        body.replaceChildren(
          ...monthGroups(listed).map(([month, refs]) =>
            h('section', { class: 'selection-month' }, h('h3', { class: 'selection-month-title' }, month), h('ol', { class: 'gig-list' }, ...refs.map(row))),
          ),
          ...(overflow > 0 ? [h('p', { class: 'selection-more' }, t().selection.moreNotListed(overflow))] : []),
        );
      }
      if (headingChanged) {
        announcer.textContent = t().selection.announce(heading.title, props.shows.length);
      }
    },
    highlight(showIds) {
      const next = [...showIds].flatMap((id) => rowsByShowId.get(id) ?? []);
      if (next.length === highlighted.length && next.every((element, index) => element === highlighted[index])) return;
      for (const element of highlighted) element.classList.remove('is-highlighted');
      for (const element of next) element.classList.add('is-highlighted');
      highlighted = next;
      const [first] = next;
      if (first !== undefined && !isInView(first)) first.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    },
    focusTitle: () => title.focus(),
  };
}

function sameHeading(a: SelectionHeading, b: SelectionHeading): boolean {
  return a.title === b.title && a.bandId === b.bandId && a.note === b.note && a.emptyMessage === b.emptyMessage && a.canReplayTour === b.canReplayTour;
}

function monthGroups(shows: readonly ShowRef[]): [string, ShowRef[]][] {
  const groups = new Map<string, ShowRef[]>();
  for (const ref of shows) {
    const month = formats().month.format(new Date(ref.start));
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
    show.venue === null ? h('span', { class: 'is-unknown' }, t().selection.venueUnknown) : h('span', {}, show.venue),
    show.startTime === null ? null : h('span', {}, t().selection.starts(formatTime(show.startTime))),
    show.endDate === null ? null : h('span', {}, t().selection.until(formatDate(show.endDate))),
  ].filter((fact) => fact !== null);
  const links = [show.ticketUrl === null ? null : safeExternalLink(show.ticketUrl, t().selection.tickets), safeExternalLink(show.sourceUrl ?? band.file.source.url, t().selection.source)].filter(
    (link) => link !== null,
  );
  const status = statusKind(ref);

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
        status === null ? null : h('span', { class: `status-tag status-${status === 'played' ? 'past' : status}` }, t().status[status]),
        ...links,
        h('span', { class: 'gig-precision' }, show.geo.precision === 'venue' ? t().selection.pinVenue : t().selection.pinCity),
      ),
    ),
  );
}

/** Whether the row is fully visible inside the sidebar's scroll area. */
function isInView(element: HTMLElement): boolean {
  const scroller = element.closest('.sidebar-body');
  if (scroller === null) return true;
  const row = element.getBoundingClientRect();
  const area = scroller.getBoundingClientRect();
  return row.top >= area.top && row.bottom <= area.bottom;
}
