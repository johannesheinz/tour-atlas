import { geoEqualEarth } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import {
  FIT_MOTION_SETTINGS,
  affineMaxStretch,
  affineScale,
  applyAffine,
  chooseFitMotion,
  cutInView,
  fitAffine,
  frameCanMove,
  invertAffine,
  largestShift,
  matchedPoints,
  moveStage,
  type Affine,
  type PointPair,
} from '../../src/view/fitMotion.ts';
import { computeMapFit, type LonLat, type MapFit } from '../../src/view/geoFit.ts';

const WIDTH = 1000;
const HEIGHT = 600;
const VIEWPORT = { width: WIDTH, height: HEIGHT, padding: 32, minSpanKm: 300 };

const projectionAt = (fit: MapFit) => geoEqualEarth().rotate([...fit.rotate]).scale(fit.scale).translate([...fit.translate]);
const fitTo = (points: readonly LonLat[]) => computeMapFit(points, VIEWPORT);

const SCANDINAVIA: LonLat[] = [[18.07, 59.33], [10.75, 59.91], [24.94, 60.17], [12.57, 55.68]];
const EUROPE: LonLat[] = [[18.07, 59.33], [-3.7, 40.42], [13.4, 52.52], [2.35, 48.86], [24.94, 60.17]];
const EUROPE_AND_UK: LonLat[] = [...EUROPE, [-0.13, 51.51], [-6.26, 53.35]];
const EUROPE_AND_US: LonLat[] = [[18.07, 59.33], [13.4, 52.52], [-74, 40.71], [-118.24, 34.05]];
const WHOLE_WORLD = computeMapFit([], VIEWPORT);
const turned = (fit: MapFit, degrees: number): MapFit => ({ ...fit, rotate: [fit.rotate[0] + degrees, 0, 0] });

function moveResidual(from: MapFit, to: MapFit): number | null {
  return fitAffine(matchedPoints(projectionAt(from), projectionAt(to), WIDTH, HEIGHT))?.maxResidual ?? null;
}

describe('fitAffine', () => {
  const matrix: Affine = { a: 1.8, b: 0.1, c: -0.3, d: 1.6, e: 40, f: -12 };
  const grid: PointPair[] = [0, 50, 100, 150].flatMap((x) => [0, 70, 140].map((y) => ({ from: [x, y] as const, to: applyAffine(matrix, x, y) })));

  it('recovers an affine map exactly', () => {
    const fitted = fitAffine(grid);
    expect(fitted?.maxResidual).toBeLessThan(1e-9);
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f'] as const) expect(fitted?.matrix[key]).toBeCloseTo(matrix[key], 9);
  });

  it('reports how far the best map misses points that no affine map fits', () => {
    const bent = grid.map((pair, index) => (index === 0 ? { ...pair, to: [pair.to[0] + 12, pair.to[1]] as const } : pair));
    expect(fitAffine(bent)?.maxResidual).toBeGreaterThan(5);
  });

  it('gives up on too few points or points on one line', () => {
    expect(fitAffine(grid.slice(0, 2))).toBeNull();
    expect(fitAffine([0, 1, 2, 3].map((x) => ({ from: [x, 2 * x] as const, to: [x, x] as const })))).toBeNull();
  });

  it('turns a zoom of the same projection into exactly that zoom', () => {
    const base = fitTo(EUROPE);
    const k = 2.5;
    const zoomed: MapFit = { ...base, scale: base.scale * k, translate: [base.translate[0] * k - 300, base.translate[1] * k - 120] };
    const fitted = fitAffine(matchedPoints(projectionAt(base), projectionAt(zoomed), WIDTH, HEIGHT));
    expect(fitted?.maxResidual).toBeLessThan(1e-6);
    expect(fitted?.matrix.a).toBeCloseTo(k, 9);
    expect(fitted?.matrix.d).toBeCloseTo(k, 9);
    expect(fitted?.matrix.b).toBeCloseTo(0, 9);
    expect(fitted?.matrix.c).toBeCloseTo(0, 9);
    expect(fitted?.matrix.e).toBeCloseTo(-300, 6);
    expect(fitted?.matrix.f).toBeCloseTo(-120, 6);
  });

  it('follows a small turn of the flat map within the move tolerance, but not a large one', () => {
    expect(moveResidual(fitTo(EUROPE), fitTo(EUROPE_AND_UK))).toBeLessThan(FIT_MOTION_SETTINGS.maxTransformResidualPx);
    expect(moveResidual(fitTo(SCANDINAVIA), fitTo(EUROPE))).toBeLessThan(FIT_MOTION_SETTINGS.maxTransformResidualPx);
    expect(moveResidual(fitTo(EUROPE), fitTo(EUROPE_AND_US))).toBeGreaterThan(FIT_MOTION_SETTINGS.maxTransformResidualPx);
  });
});

describe('matchedPoints', () => {
  it('leaves out places between the two cuts, so a turned world view still pairs consistently', () => {
    const pairs = matchedPoints(projectionAt(WHOLE_WORLD), projectionAt(turned(WHOLE_WORLD, 3)), WIDTH, HEIGHT);
    expect(pairs.length).toBeGreaterThan(20);
    expect(fitAffine(pairs)?.maxResidual).toBeLessThan(10);
  });

  it('widens the grid when the viewport shows only sky above the pole', () => {
    const base = fitTo(EUROPE);
    const sky: MapFit = { rotate: base.rotate, scale: base.scale * 6, translate: [base.translate[0], base.translate[1] * 6 + 4000] };
    expect(matchedPoints(projectionAt(base), projectionAt(sky), WIDTH, HEIGHT).length).toBeGreaterThanOrEqual(FIT_MOTION_SETTINGS.minPairs);
    expect(fitAffine(matchedPoints(projectionAt(base), projectionAt(sky), WIDTH, HEIGHT))).not.toBeNull();
  });
});

describe('largestShift', () => {
  const base = fitTo(EUROPE);
  const shifted = (dx: number): MapFit => ({ ...base, translate: [base.translate[0] + dx, base.translate[1]] });
  const shift = (to: MapFit) => largestShift(matchedPoints(projectionAt(base), projectionAt(to), WIDTH, HEIGHT));

  it('measures how far the map moves on screen', () => {
    expect(shift(base)).toBeLessThan(1e-9);
    expect(shift(shifted(0.6))).toBeCloseTo(0.6, 6);
    expect(shift(shifted(3))).toBeCloseTo(3, 6);
  });

  it('never calls an unknown move small', () => {
    expect(largestShift([])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('chooseFitMotion', () => {
  it('skips a fit that moves nothing further than a pixel', () => {
    expect(chooseFitMotion(0, true, 0)).toBe('skip');
    expect(chooseFitMotion(FIT_MOTION_SETTINGS.skipShiftPx, false, null)).toBe('skip');
  });

  it('moves the drawn flat map when its end lands close to the real projection', () => {
    expect(chooseFitMotion(200, true, 0.4)).toBe('move');
    expect(chooseFitMotion(200, true, FIT_MOTION_SETTINGS.maxTransformResidualPx)).toBe('move');
  });

  it('moves while frames stay close and then projects, when the end cannot be reached by moving', () => {
    expect(chooseFitMotion(200, true, 25)).toBe('move-then-project');
    expect(chooseFitMotion(200, true, null)).toBe('move-then-project');
  });

  it('projects the globe every frame', () => {
    expect(chooseFitMotion(200, false, null)).toBe('project');
  });

  it('decides the stage of a retargeted fit and of each checked frame', () => {
    expect(moveStage(0.5)).toBe('move');
    expect(moveStage(null)).toBe('move-then-project');
    expect(frameCanMove(0.5, false)).toBe(true);
    expect(frameCanMove(0.5, true)).toBe(false);
    expect(frameCanMove(FIT_MOTION_SETTINGS.maxTransformResidualPx + 0.1, false)).toBe(false);
    expect(frameCanMove(null, false)).toBe(false);
  });
});

describe('cutInView', () => {
  it('finds the cut of a turned world map inside a world view', () => {
    expect(cutInView(WHOLE_WORLD.rotate[0], projectionAt(turned(WHOLE_WORLD, 3)), WIDTH, HEIGHT)).toBe(true);
    expect(cutInView(WHOLE_WORLD.rotate[0], projectionAt(turned(WHOLE_WORLD, -0.5)), WIDTH, HEIGHT)).toBe(true);
  });

  it('ignores the cut when the map is not turned, or when the view is far from it', () => {
    expect(cutInView(WHOLE_WORLD.rotate[0], projectionAt({ ...WHOLE_WORLD, scale: WHOLE_WORLD.scale * 0.9 }), WIDTH, HEIGHT)).toBe(false);
    expect(cutInView(fitTo(EUROPE).rotate[0], projectionAt(fitTo(SCANDINAVIA)), WIDTH, HEIGHT)).toBe(false);
  });
});

describe('affine helpers', () => {
  const matrix: Affine = { a: 2, b: 0.5, c: -0.25, d: 1.5, e: 10, f: -4 };

  it('inverts', () => {
    const [x, y] = applyAffine(matrix, 13, -7);
    const back = applyAffine(invertAffine(matrix), x, y);
    expect(back[0]).toBeCloseTo(13, 9);
    expect(back[1]).toBeCloseTo(-7, 9);
    expect(() => invertAffine({ a: 1, b: 2, c: 2, d: 4, e: 0, f: 0 })).toThrow(RangeError);
  });

  it('measures zoom as the square root of the area scale, and the longest stretch', () => {
    expect(affineScale({ a: 3, b: 0, c: 0, d: 3, e: 5, f: 5 })).toBe(3);
    expect(affineScale({ a: 4, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBe(2);
    expect(affineMaxStretch({ a: 4, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBeCloseTo(4, 9);
    expect(affineMaxStretch({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 })).toBeCloseTo(2, 9);
  });
});
