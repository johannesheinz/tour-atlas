export interface LabelCandidate {
  readonly id: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pinRadius: number;
}

export interface Obstacle {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface PlacedLabel {
  readonly id: string;
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly anchor: 'start' | 'end';
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const GAP = 4;
const CELL = 64;

/**
 * Greedy collision check: candidates in priority order try the right, then the left side of their pin.
 * A label is placed only if it overlaps no placed label, no other pin and stays inside the viewport.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  obstacles: readonly Obstacle[],
  viewport: { readonly width: number; readonly height: number },
): PlacedLabel[] {
  const pinGrid = new SpatialGrid<Obstacle>();
  for (const obstacle of obstacles) {
    pinGrid.insert(
      { left: obstacle.x - obstacle.radius, top: obstacle.y - obstacle.radius, right: obstacle.x + obstacle.radius, bottom: obstacle.y + obstacle.radius },
      obstacle,
    );
  }
  const labelGrid = new SpatialGrid<Box>();
  const placed: PlacedLabel[] = [];

  for (const candidate of candidates) {
    const top = candidate.y - candidate.height / 2;
    const options: { box: Box; anchor: 'start' | 'end' }[] = [
      { anchor: 'start', box: boxAt(candidate.x + candidate.pinRadius + GAP, top, candidate) },
      { anchor: 'end', box: boxAt(candidate.x - candidate.pinRadius - GAP - candidate.width, top, candidate) },
    ];
    const fit = options.find(({ box }) => {
      if (box.left < 0 || box.top < 0 || box.right > viewport.width || box.bottom > viewport.height) return false;
      if (labelGrid.query(box).some((other) => intersects(box, other))) return false;
      return !pinGrid.query(box).some((pin) => pin.id !== candidate.id && circleIntersectsBox(pin, box));
    });
    if (fit === undefined) continue;
    labelGrid.insert(fit.box, fit.box);
    placed.push({
      id: candidate.id,
      text: candidate.text,
      left: fit.box.left,
      top: fit.box.top,
      width: candidate.width,
      height: candidate.height,
      anchor: fit.anchor,
    });
  }
  return placed;
}

function boxAt(left: number, top: number, size: { readonly width: number; readonly height: number }): Box {
  return { left, top, right: left + size.width, bottom: top + size.height };
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function circleIntersectsBox(circle: Obstacle, box: Box): boolean {
  const nearestX = Math.max(box.left, Math.min(circle.x, box.right));
  const nearestY = Math.max(box.top, Math.min(circle.y, box.bottom));
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.radius;
}

class SpatialGrid<T> {
  readonly #cells = new Map<string, T[]>();

  insert(box: Box, item: T): void {
    for (const key of this.#keys(box)) {
      const cell = this.#cells.get(key);
      if (cell === undefined) this.#cells.set(key, [item]);
      else cell.push(item);
    }
  }

  query(box: Box): T[] {
    return [...new Set(this.#keys(box).flatMap((key) => this.#cells.get(key) ?? []))];
  }

  #keys(box: Box): string[] {
    const keys: string[] = [];
    for (let x = Math.floor(box.left / CELL); x <= Math.floor(box.right / CELL); x++) {
      for (let y = Math.floor(box.top / CELL); y <= Math.floor(box.bottom / CELL); y++) keys.push(`${x},${y}`);
    }
    return keys;
  }
}
