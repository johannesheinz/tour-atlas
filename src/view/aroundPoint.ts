import type { ShowRef } from '../model.ts';
import { cityKey, type PlaceKey } from '../places.ts';
import { normalizeLongitude, type LonLat } from './geoFit.ts';
import { distanceKm, type Distance, type MapViewPreset } from './mapRegions.ts';

/** Two decimals, about a kilometre: what the URL keeps, so a picked point and a shared link describe the same area. */
const COORDINATE_FACTOR = 100;

export function roundCoordinate(value: number): number {
  const rounded = Math.round(value * COORDINATE_FACTOR) / COORDINATE_FACTOR;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function roundPoint([lon, lat]: LonLat): LonLat {
  return [roundCoordinate(normalizeLongitude(lon)), roundCoordinate(lat)];
}

/** The area around a point, centred where the URL would put it. */
export function pointView(center: LonLat, radius: Distance): MapViewPreset {
  return { kind: 'point', center: roundPoint(center), radius };
}

export interface NearestCity {
  readonly key: PlaceKey;
  readonly city: string;
  readonly distanceKm: number;
}

/**
 * The city of the show closest to the centre, if one lies inside the radius. Ties go to the smaller city key, then
 * the smaller name, so the same data always names the same city.
 */
export function nearestCity(shows: Iterable<ShowRef>, center: LonLat, radiusKm: number): NearestCity | null {
  let best: NearestCity | null = null;
  for (const ref of shows) {
    const distance = distanceKm(center, [ref.show.geo.lon, ref.show.geo.lat]);
    if (distance > radiusKm) continue;
    const candidate = { key: cityKey(ref), city: ref.show.city, distanceKm: distance };
    if (best === null || isCloser(candidate, best)) best = candidate;
  }
  return best;
}

function isCloser(a: NearestCity, b: NearestCity): boolean {
  if (a.distanceKm !== b.distanceKm) return a.distanceKm < b.distanceKm;
  if (a.key !== b.key) return a.key < b.key;
  return a.city < b.city;
}

/** Where "around here" centres for the shows of one place: their only spot, else the city centre the data pins, else the middle of the venues. */
export function placeCenter(shows: readonly ShowRef[]): LonLat {
  const [first] = shows;
  if (first === undefined) throw new RangeError('a place needs at least one show');
  const spots = new Map(shows.map((ref) => [`${ref.show.geo.lon},${ref.show.geo.lat}`, ref.show.geo]));
  const cityPin = shows.find((ref) => ref.show.geo.precision === 'city')?.show.geo;
  if (spots.size === 1) return roundPoint([first.show.geo.lon, first.show.geo.lat]);
  if (cityPin !== undefined) return roundPoint([cityPin.lon, cityPin.lat]);
  const venues = [...spots.values()];
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return roundPoint([mean(venues.map((geo) => geo.lon)), mean(venues.map((geo) => geo.lat))]);
}
