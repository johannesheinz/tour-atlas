import { geoEqualEarth } from 'd3-geo';

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
