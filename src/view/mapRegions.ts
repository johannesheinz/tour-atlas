import { geoDistance } from 'd3-geo';
import type { ShowRef } from '../model.ts';
import type { LonLat } from './geoFit.ts';

export interface MapRegion {
  readonly id: string;
  readonly label: string;
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

export const MAP_REGIONS: readonly MapRegion[] = [
  { id: 'europe', label: 'Europe', west: -25, south: 34, east: 45, north: 71 },
  { id: 'north-america', label: 'North America', west: -168, south: 7, east: -52, north: 72 },
  { id: 'south-america', label: 'South America', west: -82, south: -56, east: -34, north: 13 },
  { id: 'asia', label: 'Asia', west: 60, south: -11, east: 150, north: 56 },
  { id: 'africa', label: 'Africa', west: -18, south: -35, east: 52, north: 37 },
  { id: 'oceania', label: 'Oceania', west: 112, south: -48, east: 180, north: -9 },
  { id: 'world', label: 'World', west: -180, south: -60, east: 180, north: 80 },
];

export const NEAR_ME_RADII_KM = [25, 50, 100, 250] as const;
export type NearMeRadius = (typeof NEAR_ME_RADII_KM)[number];

export type MapViewPreset =
  | { readonly kind: 'shows' }
  | { readonly kind: 'region'; readonly region: MapRegion }
  | { readonly kind: 'near'; readonly radiusKm: NearMeRadius };

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
