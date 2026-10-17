import { geoDistance, geoEqualEarth } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { computeMapFit, interpolateFit, longitudeCenter, normalizeLongitude, type LonLat, type MapFit } from '../../src/view/geoFit.ts';

const VIEWPORT = { width: 1000, height: 600, padding: 32, minSpanKm: 300 };
const EARTH_RADIUS_KM = 6371;

function project(fit: MapFit, point: LonLat): [number, number] {
  const projection = geoEqualEarth().rotate([...fit.rotate]).scale(fit.scale).translate([...fit.translate]);
  const projected = projection([point[0], point[1]]);
  if (projected === null) throw new Error('point did not project');
  return projected;
}

function expectInsidePadding(fit: MapFit, points: readonly LonLat[]) {
  for (const point of points) {
    const [x, y] = project(fit, point);
    expect(x).toBeGreaterThanOrEqual(VIEWPORT.padding - 1);
    expect(x).toBeLessThanOrEqual(VIEWPORT.width - VIEWPORT.padding + 1);
    expect(y).toBeGreaterThanOrEqual(VIEWPORT.padding - 1);
    expect(y).toBeLessThanOrEqual(VIEWPORT.height - VIEWPORT.padding + 1);
  }
}

describe('longitudeCenter', () => {
  it('takes the midpoint of an ordinary span', () => {
    expect(longitudeCenter([-10, 30])).toBeCloseTo(10);
  });

  it('crosses the antimeridian when that arc is shorter', () => {
    expect(Math.abs(longitudeCenter([170, -170]))).toBeCloseTo(180);
    expect(longitudeCenter([139.65, 174.76, -157.86, -118.24])).toBeCloseTo(-169.3, 0);
  });

  it('returns the single longitude', () => {
    expect(longitudeCenter([12.5])).toBe(12.5);
  });

  it('normalises longitudes', () => {
    expect(normalizeLongitude(190)).toBe(-170);
    expect(normalizeLongitude(-190)).toBe(170);
    expect(normalizeLongitude(180)).toBe(180);
  });
});

describe('computeMapFit', () => {
  it('fits the whole sphere when there is no data', () => {
    const fit = computeMapFit([], VIEWPORT);
    expect(fit.rotate).toEqual([0, 0, 0]);
  });

  it('keeps European data inside the padded viewport', () => {
    const europe: LonLat[] = [[-9.14, 38.72], [24.94, 60.17], [13.4, 52.52], [-21.94, 64.15]];
    const fit = computeMapFit(europe, VIEWPORT);
    expect(fit.rotate[0]).toBeCloseTo(-longitudeCenter(europe.map(([lon]) => lon)));
    expectInsidePadding(fit, europe);
  });

  it('rotates a trans-Pacific tour onto the antimeridian instead of splitting it', () => {
    const pacific: LonLat[] = [[139.65, 35.68], [174.76, -36.85], [-157.86, 21.31], [-118.24, 34.05]];
    const fit = computeMapFit(pacific, VIEWPORT);
    expect(fit.rotate[0]).toBeCloseTo(169.3, 0);
    expectInsidePadding(fit, pacific);
    const [tokyoX] = project(fit, [139.65, 35.68]);
    const [losAngelesX] = project(fit, [-118.24, 34.05]);
    expect(tokyoX).toBeLessThan(losAngelesX);
  });

  it('keeps about 300 km of surroundings for a single-city dataset', () => {
    const reykjavik: LonLat = [-21.94, 64.15];
    const fit = computeMapFit([reykjavik, reykjavik], VIEWPORT);
    expect(Number.isFinite(fit.scale)).toBe(true);
    const halfSpanDegrees = (150 / EARTH_RADIUS_KM) * (180 / Math.PI);
    const north: LonLat = [reykjavik[0], reykjavik[1] + halfSpanDegrees];
    const east: LonLat = [reykjavik[0] + halfSpanDegrees / Math.cos((reykjavik[1] * Math.PI) / 180), reykjavik[1]];
    expect(geoDistance([...reykjavik], [...north]) * EARTH_RADIUS_KM).toBeCloseTo(150, 0);
    expectInsidePadding(fit, [reykjavik, north, east]);
    const [centerX, centerY] = project(fit, reykjavik);
    const [eastX] = project(fit, east);
    const [, northY] = project(fit, north);
    const fillsWidth = (eastX - centerX) / ((VIEWPORT.width - 2 * VIEWPORT.padding) / 2);
    const fillsHeight = (centerY - northY) / ((VIEWPORT.height - 2 * VIEWPORT.padding) / 2);
    expect(Math.max(fillsWidth, fillsHeight)).toBeCloseTo(1, 1);
  });

  it('rejects a viewport smaller than its padding', () => {
    expect(() => computeMapFit([], { ...VIEWPORT, width: 40 })).toThrow(RangeError);
  });
});

describe('interpolateFit', () => {
  it('rotates the short way round', () => {
    const from: MapFit = { rotate: [170, 0, 0], scale: 100, translate: [0, 0] };
    const to: MapFit = { rotate: [-170, 0, 0], scale: 400, translate: [100, 50] };
    const middle = interpolateFit(from, to, 0.5);
    expect(middle.rotate[0]).toBeCloseTo(180);
    expect(middle.scale).toBeCloseTo(200);
    expect(middle.translate).toEqual([50, 25]);
  });
});
