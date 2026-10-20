import type { ShowRef } from '../model.ts';

/** Shows at identical coordinates. */
export interface PinGroup {
  readonly key: string;
  readonly lon: number;
  readonly lat: number;
  readonly shows: readonly ShowRef[];
}

export interface ProjectedGroup {
  readonly group: PinGroup;
  readonly x: number;
  readonly y: number;
}

/** What is drawn: one or more groups that sit too close together on screen to tell apart. */
export interface DisplayPin {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly groups: readonly PinGroup[];
  readonly shows: readonly ShowRef[];
  readonly bandIds: readonly string[];
  readonly allPast: boolean;
  readonly allCancelled: boolean;
  readonly firstStart: number;
}

const COORDINATE_DECIMALS = 5;

export function groupByCoordinates(shows: readonly ShowRef[]): PinGroup[] {
  const groups = new Map<string, { lon: number; lat: number; shows: ShowRef[] }>();
  for (const ref of shows) {
    const { lat, lon } = ref.show.geo;
    const key = `${lat.toFixed(COORDINATE_DECIMALS)},${lon.toFixed(COORDINATE_DECIMALS)}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { lon, lat, shows: [ref] });
    else group.shows.push(ref);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    lon: group.lon,
    lat: group.lat,
    shows: group.shows.toSorted((a, b) => a.start - b.start || a.band.file.band.name.localeCompare(b.band.file.band.name)),
  }));
}

/**
 * Greedy screen-space clustering: biggest groups claim their neighbourhood first.
 * `radius` is in the same units as x/y; groups closer than that merge into one pin anchored at the biggest.
 */
export function clusterGroups(projected: readonly ProjectedGroup[], radius: number): DisplayPin[] {
  const ordered = projected.toSorted((a, b) => b.group.shows.length - a.group.shows.length || (a.group.key < b.group.key ? -1 : 1));
  const cellSize = Math.max(radius, Number.EPSILON);
  const grid = new Map<string, { anchor: ProjectedGroup; members: ProjectedGroup[] }[]>();
  const clusters: { anchor: ProjectedGroup; members: ProjectedGroup[] }[] = [];

  for (const item of ordered) {
    const cellX = Math.floor(item.x / cellSize);
    const cellY = Math.floor(item.y / cellSize);
    let target: { anchor: ProjectedGroup; members: ProjectedGroup[] } | undefined;
    for (let dx = -1; dx <= 1 && target === undefined; dx++) {
      for (let dy = -1; dy <= 1 && target === undefined; dy++) {
        target = grid.get(`${cellX + dx},${cellY + dy}`)?.find(
          (cluster) => Math.hypot(cluster.anchor.x - item.x, cluster.anchor.y - item.y) < radius,
        );
      }
    }
    if (target !== undefined) {
      target.members.push(item);
      continue;
    }
    const cluster = { anchor: item, members: [item] };
    clusters.push(cluster);
    const cellKey = `${cellX},${cellY}`;
    grid.set(cellKey, [...(grid.get(cellKey) ?? []), cluster]);
  }

  return clusters.map(({ anchor, members }) => toDisplayPin(anchor, members));
}

function toDisplayPin(anchor: ProjectedGroup, members: readonly ProjectedGroup[]): DisplayPin {
  const groups = members.map((member) => member.group);
  const shows = groups.flatMap((group) => group.shows).toSorted((a, b) => a.start - b.start);
  const firstShow = shows[0];
  if (firstShow === undefined) throw new Error(`pin ${anchor.group.key} has no shows`);
  return {
    id: anchor.group.key,
    x: anchor.x,
    y: anchor.y,
    groups,
    shows,
    bandIds: [...new Set(shows.map((ref) => ref.band.file.band.id))],
    allPast: shows.every((ref) => ref.isPast),
    allCancelled: shows.every((ref) => ref.show.status === 'cancelled'),
    firstStart: firstShow.start,
  };
}

/** Busiest pin first; equal counts by id, so the order never depends on how the pins were found or drawn before. */
export function compareByProminence(a: DisplayPin, b: DisplayPin): number {
  if (a !== b && a.id === b.id) throw new Error(`two pins share the id ${a.id}`);
  return b.shows.length - a.shows.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Bottom to top: the busiest pin is painted last, so it sits on top of the pins it overlaps. */
export function paintOrder(pins: readonly DisplayPin[]): DisplayPin[] {
  return pins.toSorted((a, b) => compareByProminence(b, a));
}

/** City names of a pin, biggest group first: "Berlin" or "Berlin +2". */
export function pinLabel(pin: DisplayPin): string {
  const cities = [...new Set(pin.groups.map((group) => group.shows[0]?.show.city ?? ''))].filter((city) => city !== '');
  const [first, ...rest] = cities;
  if (first === undefined) return '';
  return rest.length === 0 ? first : `${first} +${rest.length}`;
}
