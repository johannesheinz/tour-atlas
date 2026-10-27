/** The heights the bottom sheet rests at on phones, lowest first. */
export type SheetHeight = 'closed' | 'half' | 'full';

export const SHEET_HEIGHTS: readonly SheetHeight[] = ['closed', 'half', 'full'];

export const SHEET_SETTINGS = {
  /** Half height as a share of the window, enough for a band's first shows with its route still in view above. */
  halfFraction: 0.45,
  /** A release at least this fast (px per ms) moves on to the next height in its direction, wherever it is let go. */
  flingVelocity: 0.4,
  /** Only the last moments of a drag count for its release speed. */
  velocityWindowMs: 80,
  /** A press that moves less than this is a tap on the handle. */
  dragThresholdPx: 6,
  /** The length of the slide in styles.css (.is-snapping). */
  snapDurationMs: 240,
} as const;

export interface SheetMeasures {
  readonly viewportHeight: number;
  /** The closed sheet: its handle only, above the system's bottom inset. */
  readonly handleHeight: number;
  /** Where the full sheet's top stops, measured from the top of the window: just below the search. */
  readonly ceiling: number;
  /** Everything above this line, measured from the top of the window, stays in view at half height: the map controls. */
  readonly halfFloor: number;
}

/** The visible height of the sheet at each resting height, in px from the bottom of the window. */
export type SheetSizes = Readonly<Record<SheetHeight, number>>;

export function sheetSizes(measures: SheetMeasures): SheetSizes {
  const { viewportHeight, handleHeight, ceiling, halfFloor } = measures;
  for (const [name, value] of Object.entries(measures)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a length, is ${value}`);
  }
  if (viewportHeight === 0) throw new RangeError('the window has no height to place the sheet in');
  const closed = handleHeight;
  const full = Math.max(closed, viewportHeight - ceiling);
  const half = clamp(Math.min(Math.round(viewportHeight * SHEET_SETTINGS.halfFraction), viewportHeight - halfFloor), closed, full);
  return { closed, half, full };
}

/** A dragged sheet stays between closed and full. */
export function clampToSizes(sizes: SheetSizes, visibleHeight: number): number {
  return clamp(visibleHeight, sizes.closed, sizes.full);
}

/**
 * Where a released drag comes to rest: a fling goes on to the next height in its direction,
 * a slow release to the nearest one. `velocity` is in px per ms, positive while the sheet grows.
 */
export function snapAfterDrag(sizes: SheetSizes, visibleHeight: number, velocity: number): SheetHeight {
  if (!Number.isFinite(visibleHeight) || !Number.isFinite(velocity)) throw new RangeError(`cannot snap from ${visibleHeight} at ${velocity}`);
  if (velocity >= SHEET_SETTINGS.flingVelocity) return SHEET_HEIGHTS.find((height) => sizes[height] > visibleHeight) ?? 'full';
  if (velocity <= -SHEET_SETTINGS.flingVelocity) return SHEET_HEIGHTS.findLast((height) => sizes[height] < visibleHeight) ?? 'closed';
  return SHEET_HEIGHTS.reduce((nearest, height) => (Math.abs(sizes[height] - visibleHeight) < Math.abs(sizes[nearest] - visibleHeight) ? height : nearest));
}

export interface DragSample {
  readonly time: number;
  readonly visibleHeight: number;
}

/** The sheet's speed over the last moments of a drag, in px per ms; 0 when the pointer rested before letting go. */
export function releaseVelocity(samples: readonly DragSample[]): number {
  const last = samples.at(-1);
  if (last === undefined) throw new RangeError('a drag has at least one sample');
  const recent = samples.filter((sample) => last.time - sample.time <= SHEET_SETTINGS.velocityWindowMs);
  const first = recent[0];
  if (first === undefined || last.time === first.time) return 0;
  return (last.visibleHeight - first.visibleHeight) / (last.time - first.time);
}

/** The handle's button opens to half and closes from any height. */
export function toggledHeight(current: SheetHeight): SheetHeight {
  return current === 'closed' ? 'half' : 'closed';
}

/** Arrow keys on the handle move one height up or down, stopping at the ends. */
export function steppedHeight(current: SheetHeight, direction: 'up' | 'down'): SheetHeight {
  const index = clamp(SHEET_HEIGHTS.indexOf(current) + (direction === 'up' ? 1 : -1), 0, SHEET_HEIGHTS.length - 1);
  const next = SHEET_HEIGHTS[index];
  if (next === undefined) throw new Error(`no sheet height at ${index}`);
  return next;
}

/**
 * How far an element of the page reaches under a sheet of this visible height, in px; 0 when it is clear of it.
 * `elementBottom` is measured from the top of the window.
 */
export function sheetCover(visibleHeight: number, viewportHeight: number, elementBottom: number): number {
  return Math.max(0, elementBottom - (viewportHeight - visibleHeight));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
