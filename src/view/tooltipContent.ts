import { bandColor, type ShowRef, type ThemeMode } from '../model.ts';
import { t } from '../i18n/index.ts';
import { countryName, formatDateSpan, formatTime, statusKind } from './format.ts';

export interface TooltipLine {
  /** Band colour for the swatch; null for lines that are not about one band. */
  readonly color: string | null;
  readonly text: string;
  readonly detail: string | null;
}

export interface TooltipContent {
  /** Set when the tooltip is about one band: its logo and name lead the tooltip. */
  readonly band: { readonly id: string; readonly name: string } | null;
  /** What the lines describe, e.g. "2 shows in Berlin"; null for a single show, where the band says it all. */
  readonly title: string | null;
  readonly lines: readonly TooltipLine[];
  readonly more: string | null;
}

const MAX_LINES = 3;

function where(ref: ShowRef): string {
  return [ref.show.venue ?? ref.show.eventName, ref.show.city].filter((part) => part !== null).join(', ');
}

function when(ref: ShowRef): string {
  const time = ref.show.startTime === null ? '' : `, ${formatTime(ref.show.startTime)}`;
  return `${formatDateSpan(ref.show.date, ref.show.endDate)}${time}`;
}

function withStatus(ref: ShowRef, text: string): string {
  const kind = statusKind(ref);
  return kind === null || kind === 'scheduled' ? text : `${text} (${t().status[kind].toLocaleLowerCase()})`;
}

/** One timeline dot. */
export function showTooltip(ref: ShowRef, mode: ThemeMode): TooltipContent {
  return {
    band: { id: ref.band.file.band.id, name: ref.band.file.band.name },
    title: null,
    lines: [
      { color: bandColor(ref.band, mode), text: withStatus(ref, when(ref)), detail: `${where(ref)}, ${countryName(ref.show.countryCode)}` },
    ],
    more: null,
  };
}

/**
 * A map pin: the show itself, the next few shows of one band, or the biggest bands of a mixed pin.
 * `place` is the pin label, e.g. "Berlin" or "Berlin +2".
 */
export function pinTooltip(shows: readonly ShowRef[], place: string, mode: ThemeMode): TooltipContent {
  const [first] = shows;
  if (first === undefined) throw new Error('a pin tooltip needs at least one show');
  if (shows.length === 1) return showTooltip(first, mode);

  const byBand = Map.groupBy(shows, (ref) => ref.band);
  const title = t().tooltip.showsIn(shows.length, place);
  if (byBand.size === 1) {
    return {
      band: { id: first.band.file.band.id, name: first.band.file.band.name },
      title,
      lines: shows.slice(0, MAX_LINES).map((ref) => ({ color: bandColor(ref.band, mode), text: withStatus(ref, when(ref)), detail: where(ref) })),
      more: shows.length > MAX_LINES ? t().tooltip.moreShows(shows.length - MAX_LINES) : null,
    };
  }

  const bands = [...byBand.entries()].toSorted(
    ([a, aShows], [b, bShows]) => bShows.length - aShows.length || a.file.band.name.localeCompare(b.file.band.name),
  );
  return {
    band: null,
    title,
    lines: bands.slice(0, MAX_LINES).map(([band, bandShows]) => {
      const next = bandShows.find((ref) => !ref.isPast) ?? bandShows.at(-1) ?? first;
      return { color: bandColor(band, mode), text: band.file.band.name, detail: t().tooltip.bandSummary(bandShows.length, !next.isPast, formatDateSpan(next.show.date, null)) };
    }),
    more: bands.length > MAX_LINES ? t().tooltip.moreBands(bands.length - MAX_LINES) : null,
  };
}
