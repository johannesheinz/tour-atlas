import type { Point } from './fitMotion.ts';

/** The part of the map left in view above the bottom sheet, in px of the map. */
export interface UncoverArea {
  readonly width: number;
  readonly visibleHeight: number;
  /** Pins keep this distance from the sheet's top edge and from the map's top. */
  readonly margin: number;
}

/** A move of the drawn map: every point of it goes to (scale·x + dx, scale·y + dy). */
export interface ScreenMove {
  readonly scale: number;
  readonly dx: number;
  readonly dy: number;
}

/**
 * How to move the map so these pins (screen points) are clear of the sheet: null when none is under it, a pan
 * up when their spread fits above it, else a zoom out that keeps the topmost pin in place and the rest within
 * their horizontal span. A pin already closer to the top than the margin stays where it is.
 */
export function uncoverMove(points: readonly Point[], area: UncoverArea): ScreenMove | null {
  const { width, visibleHeight, margin } = area;
  for (const [name, value] of Object.entries(area)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a length, is ${value}`);
  }
  const bottom = visibleHeight - margin;
  if (bottom <= margin || width === 0) throw new RangeError(`no room above the sheet in ${width}×${visibleHeight} with a margin of ${margin}`);
  if (!points.some(([, y]) => y > bottom)) return null;

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const top = Math.min(margin, minY);
  if (maxY - minY <= bottom - top) return { scale: 1, dx: 0, dy: bottom - maxY };

  const scale = (bottom - top) / (maxY - minY);
  const centreX = (Math.min(...xs) + Math.max(...xs)) / 2;
  return { scale, dx: centreX * (1 - scale), dy: top - scale * minY };
}

export function applyMove(move: ScreenMove, [x, y]: Point): Point {
  return [move.scale * x + move.dx, move.scale * y + move.dy];
}
