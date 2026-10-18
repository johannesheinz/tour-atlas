import { geoDistance } from 'd3-geo';
import type { DistanceUnit } from '../i18n/locale.ts';
import type { ShowRef } from '../model.ts';
import type { LonLat } from './geoFit.ts';

export type RegionId = 'europe' | 'north-america' | 'south-america' | 'asia' | 'africa' | 'oceania' | 'world';

/** Named in the message catalogs: browsers do not reliably know continent names (Chrome lacks them). */
export interface MapRegion {
  readonly id: RegionId;
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

export const MAP_REGIONS: readonly MapRegion[] = [
  { id: 'europe', west: -25, south: 34, east: 45, north: 71 },
  { id: 'north-america', west: -168, south: 7, east: -52, north: 72 },
  { id: 'south-america', west: -82, south: -56, east: -34, north: 13 },
  { id: 'asia', west: 60, south: -11, east: 150, north: 56 },
  { id: 'africa', west: -18, south: -35, east: 52, north: 37 },
  { id: 'oceania', west: 112, south: -48, east: 180, north: -9 },
  { id: 'world', west: -180, south: -60, east: 180, north: 80 },
];

export type MapMode = 'flat' | 'globe';

/** The circle drawn for an active area, with a marker at its centre: the viewer's position or a picked point. */
export interface AreaCircle {
  readonly lon: number;
  readonly lat: number;
  readonly radiusKm: number;
  readonly centre: 'viewer' | 'point';
}

export interface Distance {
  readonly value: number;
  readonly unit: DistanceUnit;
}

export const KM_PER_UNIT: Readonly<Record<DistanceUnit, number>> = { km: 1, mi: 1.609344, mil: 10 };

/** Round numbers in each unit; the search converts them exactly. */
export const NEAR_ME_RADII: Readonly<Record<DistanceUnit, readonly number[]>> = {
  km: [25, 50, 100, 250, 500, 1000],
  mi: [15, 30, 60, 150, 300, 600],
  mil: [2.5, 5, 10, 25, 50, 100],
};

export function kilometres(distance: Distance): number {
  return distance.value * KM_PER_UNIT[distance.unit];
}

export type MapViewPreset =
  | { readonly kind: 'shows' }
  | { readonly kind: 'region'; readonly region: MapRegion }
  | { readonly kind: 'near'; readonly radius: Distance }
  | { readonly kind: 'point'; readonly center: LonLat; readonly radius: Distance };

const EARTH_RADIUS_KM = 6371;
const EDGE_STEP_DEGREES = 10;

/** The region's outline sampled along its edges, so a fit respects the projection's curvature. */
export function regionPoints(region: MapRegion): LonLat[] {
  const points: LonLat[] = [];
  const steps = (from: number, to: number) => {
    const count = Math.max(1, Math.ceil(Math.abs(to - from) / EDGE_STEP_DEGREES));
    return Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count);
  };
  for (const lon of steps(region.west, region.east)) points.push([lon, region.south], [lon, region.north]);
  for (const lat of steps(region.south, region.north)) points.push([region.west, lat], [region.east, lat]);
  return points;
}

export function findRegion(id: string): MapRegion | undefined {
  return MAP_REGIONS.find((region) => region.id === id);
}

export function distanceKm(a: LonLat, b: LonLat): number {
  return geoDistance([a[0], a[1]], [b[0], b[1]]) * EARTH_RADIUS_KM;
}

export function showsWithin(shows: readonly ShowRef[], center: LonLat, radiusKm: number): ShowRef[] {
  return shows.filter((ref) => distanceKm(center, [ref.show.geo.lon, ref.show.geo.lat]) <= radiusKm);
}

/** Angular radius in degrees for d3's geoCircle. */
export function radiusDegrees(radiusKm: number): number {
  return (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
}
