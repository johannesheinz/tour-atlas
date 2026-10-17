import { bandColor, type ShowRef, type ThemeMode } from '../model.ts';

export interface PinSegment {
  /** Null for the folded "other bands" segment. */
  readonly bandId: string | null;
  readonly color: string;
  readonly startAngle: number;
  readonly endAngle: number;
}

/** More bands than this fold into one neutral "other" segment, so every segment stays readable. */
export const MAX_SEGMENTS = 6;
const TOP = -Math.PI / 2;

/** Ring segments proportional to each band's show count at the pin, biggest first, clockwise from the top. */
export function pinSegments(shows: readonly ShowRef[], mode: ThemeMode, otherColor: string): PinSegment[] {
  if (shows.length === 0) throw new Error('a pin needs at least one show');
  const counts = [...Map.groupBy(shows, (ref) => ref.band).entries()]
    .map(([band, bandShows]) => ({ band, count: bandShows.length }))
    .toSorted((a, b) => b.count - a.count || a.band.file.band.name.localeCompare(b.band.file.band.name));

  const kept = counts.length > MAX_SEGMENTS ? counts.slice(0, MAX_SEGMENTS - 1) : counts;
  const otherCount = counts.slice(kept.length).reduce((sum, entry) => sum + entry.count, 0);
  const parts = [
    ...kept.map(({ band, count }) => ({ bandId: band.file.band.id, color: bandColor(band, mode), count })),
    ...(otherCount > 0 ? [{ bandId: null, color: otherColor, count: otherCount }] : []),
  ];

  let angle = TOP;
  return parts.map(({ bandId, color, count }) => {
    const startAngle = angle;
    angle += (count / shows.length) * Math.PI * 2;
    return { bandId, color, startAngle, endAngle: angle };
  });
}

/** SVG path of a ring segment centred on the origin. */
export function annularSectorPath(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number): string {
  const point = (radius: number, angle: number) => `${(radius * Math.cos(angle)).toFixed(3)} ${(radius * Math.sin(angle)).toFixed(3)}`;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${point(outerRadius, startAngle)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${point(outerRadius, endAngle)}`,
    `L ${point(innerRadius, endAngle)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${point(innerRadius, startAngle)}`,
    'Z',
  ].join(' ');
}
