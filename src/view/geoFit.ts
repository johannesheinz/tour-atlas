import { geoCentroid, geoDistance, geoEqualEarth } from 'd3-geo';

export type LonLat = readonly [lon: number, lat: number];

export interface MapFit {
  readonly rotate: readonly [number, number, number];
  readonly scale: number;
  readonly translate: readonly [number, number];
}

export interface FitOptions {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  /** Smallest ground distance kept in view, so a single city still shows its surroundings. */
  readonly minSpanKm: number;
}

const KM_PER_DEGREE_LATITUDE = 111.32;
const MAX_BUFFER_LATITUDE = 85;

/**
 * Centre of the shortest arc covering all longitudes: the complement of the largest gap between
 * neighbouring longitudes on the circle. Handles tours that cross the antimeridian.
 */
export function longitudeCenter(longitudes: readonly number[]): number {
  const sorted = [...new Set(longitudes.map(normalizeLongitude))].toSorted((a, b) => a - b);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first === undefined || last === undefined) throw new RangeError('longitudeCenter needs at least one longitude');
  if (sorted.length === 1) return first;

  let gapStart = last;
  let largestGap = first + 360 - last;
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1] ?? first;
    const current = sorted[i] ?? first;
    if (current - previous > largestGap) {
      largestGap = current - previous;
      gapStart = previous;
    }
  }
  const arcStart = gapStart + largestGap;
  const arcLength = 360 - largestGap;
  return normalizeLongitude(arcStart + arcLength / 2);
}

export function normalizeLongitude(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && lon > 0 ? 180 : wrapped;
}

/** Rotates the Equal Earth projection onto the data and fits it into the viewport. Null points fit the whole sphere. */
export function computeMapFit(points: readonly LonLat[], options: FitOptions): MapFit {
  const { width, height, padding } = options;
  if (width <= 2 * padding || height <= 2 * padding) {
    throw new RangeError(`viewport ${width}×${height} is too small for padding ${padding}`);
  }
  const extent: [[number, number], [number, number]] = [
    [padding, padding],
    [width - padding, height - padding],
  ];

  const projection = geoEqualEarth();
  if (points.length === 0) {
    projection.rotate([0, 0, 0]).fitExtent(extent, { type: 'Sphere' });
    return snapshot(projection);
  }

  const centerLon = longitudeCenter(points.map(([lon]) => lon));
  const latitudes = points.map(([, lat]) => lat);
  const centerLat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  projection.rotate([-centerLon, 0, 0]);
  projection.fitExtent(extent, {
    type: 'MultiPoint',
    coordinates: [...points, ...minimumSpanPoints(centerLon, centerLat, options.minSpanKm)].map(([lon, lat]) => [lon, lat]),
  });
  return snapshot(projection);
}

/** Four points around the centre whose bounding box measures minSpanKm in both directions. */
export function minimumSpanPoints(centerLon: number, centerLat: number, minSpanKm: number): LonLat[] {
  const halfLat = minSpanKm / 2 / KM_PER_DEGREE_LATITUDE;
  const clampedLat = Math.max(-MAX_BUFFER_LATITUDE, Math.min(MAX_BUFFER_LATITUDE, centerLat));
  const halfLon = halfLat / Math.cos((clampedLat * Math.PI) / 180);
  return [
    [centerLon - halfLon, clampedLat],
    [centerLon + halfLon, clampedLat],
    [centerLon, Math.max(-90, clampedLat - halfLat)],
    [centerLon, Math.min(90, clampedLat + halfLat)],
  ];
}

/**
 * Orthographic globe: turn the data's centroid to the front, then scale so the farthest point
 * (or minSpanKm around the centre) stays inside a circle that fits the viewport.
 * Data spread over more than a hemisphere shows the whole globe.
 */
export function computeGlobeFit(points: readonly LonLat[], options: FitOptions): MapFit {
  const { width, height, padding } = options;
  if (width <= 2 * padding || height <= 2 * padding) {
    throw new RangeError(`viewport ${width}×${height} is too small for padding ${padding}`);
  }
  const radius = Math.min(width, height) / 2 - padding;
  const translate: [number, number] = [width / 2, height / 2];
  if (points.length === 0) return { rotate: [0, -20, 0], scale: radius, translate };

  const [centerLon, centerLat] = geoCentroid({ type: 'MultiPoint', coordinates: points.map(([lon, lat]) => [lon, lat]) });
  const center: [number, number] = [Number.isFinite(centerLon) ? centerLon : points[0]?.[0] ?? 0, Number.isFinite(centerLat) ? centerLat : points[0]?.[1] ?? 0];
  const minAngle = options.minSpanKm / 2 / EARTH_RADIUS_KM;
  const farthest = Math.max(minAngle, ...points.map(([lon, lat]) => geoDistance(center, [lon, lat])));
  const scale = farthest >= Math.PI / 2 ? radius : radius / Math.sin(farthest);
  return { rotate: [-center[0], -center[1], 0], scale, translate };
}

const EARTH_RADIUS_KM = 6371;

function snapshot(projection: ReturnType<typeof geoEqualEarth>): MapFit {
  const [lambda, phi, gamma] = projection.rotate();
  const [x, y] = projection.translate();
  return { rotate: [lambda, phi, gamma ?? 0], scale: projection.scale(), translate: [x, y] };
}

export function interpolateFit(from: MapFit, to: MapFit, t: number): MapFit {
  const lambdaDelta = ((((to.rotate[0] - from.rotate[0]) % 360) + 540) % 360) - 180;
  const scale = from.scale * (to.scale / from.scale) ** t;
  return {
    rotate: [from.rotate[0] + lambdaDelta * t, from.rotate[1] + (to.rotate[1] - from.rotate[1]) * t, 0],
    scale,
    translate: [
      from.translate[0] + (to.translate[0] - from.translate[0]) * t,
      from.translate[1] + (to.translate[1] - from.translate[1]) * t,
    ],
  };
}
