export type Point = readonly [x: number, y: number];

/** A projected route as drawn: its path data, and the same points measured, so a point along it needs no SVG lookups. */
export interface RouteLine {
  readonly pathData: string;
  /** Drawn length; the jumps between subpaths (a line cut by the antimeridian or the globe's edge) do not count. */
  readonly length: number;
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  /** Drawn length from the start to each point. */
  readonly distances: Float64Array;
  /** Whether a point starts a subpath, so the step to it is a jump, not a drawn segment. */
  readonly subpathStarts: Uint8Array;
}

/** The drawing context d3-geo's geoPath(projection, context) writes a line into. */
export interface RouteLineRecorder {
  /** Part of the canvas-like context geoPath accepts; it never calls it, and a line starts empty after finish anyway. */
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  /** The line recorded since the last finish; the recorder then starts empty. */
  finish(): RouteLine;
}

/**
 * Records a line the way geoPath writes it as path data: each coordinate rounded to `digits` decimals,
 * so the drawn path and the measured points are the same numbers.
 */
export function createRouteLineRecorder(digits: number): RouteLineRecorder {
  if (!Number.isInteger(digits) || digits < 0 || digits > 15) throw new RangeError(`invalid digits: ${digits}`);
  const factor = 10 ** digits;
  const round = (value: number) => Math.round(value * factor) / factor;
  let pathData = '';
  let xs: number[] = [];
  let ys: number[] = [];
  let starts: number[] = [];
  let subpathStart = -1;

  const add = (x: number, y: number, startsSubpath: boolean) => {
    xs.push(x);
    ys.push(y);
    starts.push(startsSubpath ? 1 : 0);
  };

  return {
    beginPath() {},
    moveTo(x, y) {
      const [roundedX, roundedY] = [round(x), round(y)];
      pathData += `M${roundedX},${roundedY}`;
      subpathStart = xs.length;
      add(roundedX, roundedY, true);
    },
    lineTo(x, y) {
      if (subpathStart === -1) throw new Error('a route line needs a moveTo before lineTo');
      const [roundedX, roundedY] = [round(x), round(y)];
      pathData += `L${roundedX},${roundedY}`;
      add(roundedX, roundedY, false);
    },
    closePath() {
      const firstX = xs[subpathStart];
      const firstY = ys[subpathStart];
      if (firstX === undefined || firstY === undefined) throw new Error('a route line needs a moveTo before closePath');
      pathData += 'Z';
      add(firstX, firstY, false);
    },
    arc() {
      throw new Error('route lines have no points to draw as circles');
    },
    finish() {
      const line = measureRouteLine(pathData, xs, ys, starts);
      pathData = '';
      xs = [];
      ys = [];
      starts = [];
      subpathStart = -1;
      return line;
    },
  };
}

function measureRouteLine(pathData: string, xs: readonly number[], ys: readonly number[], starts: readonly number[]): RouteLine {
  const line = { pathData, xs: Float64Array.from(xs), ys: Float64Array.from(ys), distances: new Float64Array(xs.length), subpathStarts: Uint8Array.from(starts) };
  let length = 0;
  for (let index = 1; index < xs.length; index++) {
    if (line.subpathStarts[index] === 0) length += Math.hypot(valueAt(line.xs, index) - valueAt(line.xs, index - 1), valueAt(line.ys, index) - valueAt(line.ys, index - 1));
    line.distances[index] = length;
  }
  return { ...line, length };
}

/** The point `distance` along the drawn line, as SVG's getPointAtLength finds it; null for a line with no points. */
export function pointAlongRoute(line: RouteLine, distance: number): Point | null {
  const count = line.xs.length;
  if (count === 0) return null;
  const target = Math.min(line.length, Math.max(0, distance));
  let low = 1;
  let high = count - 1;
  let segmentEnd = count;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (valueAt(line.distances, middle) >= target) {
      segmentEnd = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  while (segmentEnd < count && line.subpathStarts[segmentEnd] === 1) segmentEnd++;
  if (segmentEnd === count) return [valueAt(line.xs, count - 1), valueAt(line.ys, count - 1)];
  const from = segmentEnd - 1;
  const startDistance = valueAt(line.distances, from);
  const segmentLength = valueAt(line.distances, segmentEnd) - startDistance;
  const fraction = segmentLength === 0 ? 0 : (target - startDistance) / segmentLength;
  if (fraction === 1) return [valueAt(line.xs, segmentEnd), valueAt(line.ys, segmentEnd)];
  const fromX = valueAt(line.xs, from);
  const fromY = valueAt(line.ys, from);
  return [fromX + (valueAt(line.xs, segmentEnd) - fromX) * fraction, fromY + (valueAt(line.ys, segmentEnd) - fromY) * fraction];
}

function valueAt(values: Float64Array, index: number): number {
  const value = values[index];
  if (value === undefined) throw new RangeError(`no point at index ${index}`);
  return value;
}
