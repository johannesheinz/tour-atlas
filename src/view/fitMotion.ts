import type { GeoProjection } from 'd3-geo';
import { normalizeLongitude } from './geoFit.ts';

export type Point = readonly [x: number, y: number];

/** SVG's matrix(a b c d e f): x' = a·x + c·y + e, y' = b·x + d·y + f. */
export interface Affine {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export interface PointPair {
  readonly from: Point;
  readonly to: Point;
}

/**
 * How a fit gets to its target: not at all; by moving the drawn map all the way (its end checked beforehand);
 * by moving it while each frame stays close to the real projection, then projecting the rest; or projecting every frame.
 */
export type FitMotion = 'skip' | 'move' | 'move-then-project' | 'project';

export const FIT_MOTION_SETTINGS = {
  /** A fit that moves nothing further than this is not animated. */
  skipShiftPx: 1,
  /** Moving the drawn map instead of projecting it again is allowed when the last frame lands this close to the real projection. */
  maxTransformResidualPx: 2,
  /** Sample grids, tried in turn: the viewport, then wider around it. */
  grids: [
    { spread: 1, steps: 8 },
    { spread: 3, steps: 24 },
    { spread: 9, steps: 36 },
    { spread: 27, steps: 36 },
  ],
  minPairs: 12,
  /** Distinct grid rows and columns, so the pairs do not lie on one line. */
  minLines: 3,
  roundTripTolerancePx: 0.5,
  cutStepDegrees: 0.25,
  cutMarginDegrees: 0.01,
  cutMarginPx: 1,
} as const;

/**
 * Pairs a grid over the `to` viewport with where the same places lie under `from`. Spots off the map (outside
 * the flat map's outline or beside the globe) are left out, and so are places between the two maps' cuts, which
 * one of them draws at the opposite edge. While too few remain, the grid widens around the viewport, so a frame
 * showing mostly sky still has places to follow.
 */
export function matchedPoints(from: GeoProjection, to: GeoProjection, width: number, height: number): PointPair[] {
  let most: PointPair[] = [];
  for (const { spread, steps } of FIT_MOTION_SETTINGS.grids) {
    const pairs = gridPairs(from, to, steps, width * spread, height * spread, (width * (1 - spread)) / 2, (height * (1 - spread)) / 2);
    if (spansGrid(pairs)) return pairs;
    if (pairs.length > most.length) most = pairs;
  }
  return most;
}

function spansGrid(pairs: readonly PointPair[]): boolean {
  const { minPairs, minLines } = FIT_MOTION_SETTINGS;
  return pairs.length >= minPairs && new Set(pairs.map((pair) => pair.to[0])).size >= minLines && new Set(pairs.map((pair) => pair.to[1])).size >= minLines;
}

function gridPairs(from: GeoProjection, to: GeoProjection, steps: number, width: number, height: number, left: number, top: number): PointPair[] {
  const fromCut = 180 - from.rotate()[0];
  const cutsApart = normalizeLongitude(180 - to.rotate()[0] - fromCut);
  const betweenCuts = (lon: number) => {
    const past = normalizeLongitude(lon - fromCut);
    return Math.abs(past) <= FIT_MOTION_SETTINGS.cutMarginDegrees || (Math.sign(past) === Math.sign(cutsApart) && Math.abs(past) <= Math.abs(cutsApart) + FIT_MOTION_SETTINGS.cutMarginDegrees);
  };
  const pairs: PointPair[] = [];
  for (let column = 0; column <= steps; column++) {
    for (let row = 0; row <= steps; row++) {
      const screen: [number, number] = [left + (width * column) / steps, top + (height * row) / steps];
      const place = to.invert?.(screen);
      if (place === undefined || place === null || !Number.isFinite(place[0]) || !Number.isFinite(place[1])) continue;
      const back = to(place);
      if (back === null || Math.hypot(back[0] - screen[0], back[1] - screen[1]) > FIT_MOTION_SETTINGS.roundTripTolerancePx || betweenCuts(place[0])) continue;
      const source = from(place);
      if (source === null || !Number.isFinite(source[0]) || !Number.isFinite(source[1])) continue;
      pairs.push({ from: source, to: screen });
    }
  }
  return pairs;
}

/**
 * Whether the meridian where a flat map centred on `fromLambda` cuts the world runs through the `to` viewport.
 * Land on both sides of it lies at opposite edges of that map, so no affine map brings it together.
 */
export function cutInView(fromLambda: number, to: GeoProjection, width: number, height: number): boolean {
  const [toLambda] = to.rotate();
  if (Math.abs(normalizeLongitude(fromLambda - toLambda)) < 1e-9) return false;
  const cut = 180 - fromLambda;
  const margin = FIT_MOTION_SETTINGS.cutMarginPx;
  for (let lat = -90; lat <= 90; lat += FIT_MOTION_SETTINGS.cutStepDegrees) {
    const point = to([cut, lat]);
    if (point !== null && point[0] >= -margin && point[0] <= width + margin && point[1] >= -margin && point[1] <= height + margin) return true;
  }
  return false;
}

/** The farthest any paired point moves; infinite without pairs, so an unknown move is never skipped. */
export function largestShift(pairs: readonly PointPair[]): number {
  if (pairs.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(...pairs.map(({ from, to }) => Math.hypot(to[0] - from[0], to[1] - from[1])));
}

/** Least-squares affine map from each pair's `from` to its `to`; null when the points are too few or on one line. */
export function fitAffine(pairs: readonly PointPair[]): { readonly matrix: Affine; readonly maxResidual: number } | null {
  if (pairs.length < 3) return null;
  const count = pairs.length;
  const meanFromX = pairs.reduce((sum, pair) => sum + pair.from[0], 0) / count;
  const meanFromY = pairs.reduce((sum, pair) => sum + pair.from[1], 0) / count;
  const meanToX = pairs.reduce((sum, pair) => sum + pair.to[0], 0) / count;
  const meanToY = pairs.reduce((sum, pair) => sum + pair.to[1], 0) / count;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxu = 0;
  let syu = 0;
  let sxv = 0;
  let syv = 0;
  for (const { from, to } of pairs) {
    const x = from[0] - meanFromX;
    const y = from[1] - meanFromY;
    const u = to[0] - meanToX;
    const v = to[1] - meanToY;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxu += x * u;
    syu += y * u;
    sxv += x * v;
    syv += y * v;
  }
  const determinant = sxx * syy - sxy * sxy;
  if (!(Math.abs(determinant) > 1e-9 * Math.max(1, sxx * syy))) return null;
  const a = (sxu * syy - syu * sxy) / determinant;
  const c = (syu * sxx - sxu * sxy) / determinant;
  const b = (sxv * syy - syv * sxy) / determinant;
  const d = (syv * sxx - sxv * sxy) / determinant;
  const matrix: Affine = { a, b, c, d, e: meanToX - a * meanFromX - c * meanFromY, f: meanToY - b * meanFromX - d * meanFromY };
  const maxResidual = Math.max(
    ...pairs.map(({ from, to }) => {
      const [x, y] = applyAffine(matrix, from[0], from[1]);
      return Math.hypot(x - to[0], y - to[1]);
    }),
  );
  return { matrix, maxResidual };
}

/** `endResidualPx` is how far the moved drawing would end from the target's projection; null when it cannot get there. */
export function chooseFitMotion(shiftPx: number, canMove: boolean, endResidualPx: number | null): FitMotion {
  if (shiftPx <= FIT_MOTION_SETTINGS.skipShiftPx) return 'skip';
  return canMove ? moveStage(endResidualPx) : 'project';
}

export function moveStage(endResidualPx: number | null): 'move' | 'move-then-project' {
  return endResidualPx !== null && endResidualPx <= FIT_MOTION_SETTINGS.maxTransformResidualPx ? 'move' : 'move-then-project';
}

/** A frame of a move-then-project fit keeps moving the drawing while it stays close and the drawing's cut stays out of view. */
export function frameCanMove(residualPx: number | null, cutVisible: boolean): boolean {
  return !cutVisible && residualPx !== null && residualPx <= FIT_MOTION_SETTINGS.maxTransformResidualPx;
}

export function applyAffine(matrix: Affine, x: number, y: number): [number, number] {
  return [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f];
}

export function invertAffine(matrix: Affine): Affine {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (determinant === 0) throw new RangeError('a flat affine map has no inverse');
  const a = matrix.d / determinant;
  const b = -matrix.b / determinant;
  const c = -matrix.c / determinant;
  const d = matrix.a / determinant;
  return { a, b, c, d, e: -(a * matrix.e + c * matrix.f), f: -(b * matrix.e + d * matrix.f) };
}

/** How much the map grows on screen, like a zoom factor: the square root of the area scale. */
export function affineScale(matrix: Affine): number {
  return Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
}

/** The longest a unit line can become: what a dash along any direction must cover. */
export function affineMaxStretch(matrix: Affine): number {
  const sum = matrix.a ** 2 + matrix.b ** 2 + matrix.c ** 2 + matrix.d ** 2;
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  return Math.sqrt((sum + Math.sqrt(Math.max(0, sum * sum - 4 * determinant * determinant))) / 2);
}
