import type { ArcIndexes, GeometryObject, Positions as Position, Properties, Topology } from 'topojson-specification';

/**
 * Visvalingam–Whyatt on the arcs of a TopoJSON topology. Arcs are shared by every object built from them,
 * so land and country borders simplified together still meet: each arc keeps both its ends.
 *
 * A point's weight is the area of the triangle it forms with its neighbours when it is removed, in square
 * degrees scaled by the cosine of its latitude: on an equal-area projection that is proportional to the area
 * on screen. A point never weighs less than one removed before it, so the weights rank the points, and
 * keeping those that weigh at least `minArea` is the same as removing points until each remaining one does.
 *
 * Kept whatever they weigh, so that no shape degenerates:
 * - points on the antimeridian or at a pole, where a polygon cut along the map's edge must keep its outline
 *   (a ring around the South Pole that loses its points along the pole no longer encloses it);
 * - the heaviest interior point of an arc, and the two heaviest of an arc that closes on itself, so a ring
 *   made of one arc stays a triangle and a ring of two arcs keeps four corners. Islands shrink to that
 *   minimum instead of vanishing, so the coarse world shows the same islands as the detailed one;
 * - every arc of a polygon ring that the simplification would turn the other way round or flatten. A small
 *   concave island can do that, and d3-geo reads a reversed ring as covering the rest of the sphere.
 *
 * The result is in absolute longitude and latitude without a transform. Simplifying it again with the same
 * `minArea` returns it unchanged.
 */
export function simplifyTopology<T extends Topology>(topology: T, minArea: number): T {
  if (!(minArea > 0)) throw new RangeError(`minArea must be a positive area, got ${minArea}`);
  const arcs = absoluteArcs(topology);
  const kept = arcs.map((arc) => keptPoints(arc, minArea));
  const detailedShoelace = arcs.map((arc) => shoelace(arc, null));
  const simplifiedShoelace = arcs.map((arc, index) => shoelace(arc, kept[index] ?? missingArc(index)));
  const rings = Object.values(topology.objects).flatMap(polygonRings);
  for (let turned = turnedRings(rings, detailedShoelace, simplifiedShoelace); turned.length > 0; turned = turnedRings(rings, detailedShoelace, simplifiedShoelace)) {
    for (const index of new Set(turned.flat().map(arcIndex))) {
      (kept[index] ?? missingArc(index)).fill(1);
      simplifiedShoelace[index] = detailedShoelace[index] ?? missingArc(index);
    }
  }
  const { transform: _transform, ...rest } = topology;
  return { ...rest, arcs: arcs.map((arc, index) => keptPositions(arc, kept[index] ?? missingArc(index))) } as T;
}

export function countArcPoints(topology: Topology): number {
  return topology.arcs.reduce((sum, arc) => sum + arc.length, 0);
}

export const COARSE_WORLD_SETTINGS = {
  /** Points of world-atlas 50m that weigh less than this (square degrees at the equator) are dropped: about 6x fewer points. */
  minAreaSquareDegrees: 0.05,
  /** At rest the coarse world is drawn while what it drops stays below this area in device pixels; checked against screenshots. */
  maxDevicePixelArea: 0.75,
} as const;

export type WorldDetail = 'coarse' | 'detailed';

/** The detail a world drawn at `scale` (projected px per radian) needs at rest. */
export function worldDetailAt(scale: number, devicePixelRatio: number): WorldDetail {
  if (!(scale > 0) || !(devicePixelRatio > 0)) throw new RangeError('scale and device pixel ratio must be positive');
  const { minAreaSquareDegrees, maxDevicePixelArea } = COARSE_WORLD_SETTINGS;
  const largestCoarseDeviceScale = (180 / Math.PI) * Math.sqrt(maxDevicePixelArea / minAreaSquareDegrees);
  return scale * devicePixelRatio <= largestCoarseDeviceScale ? 'coarse' : 'detailed';
}

const EDGE_TOLERANCE_DEGREES = 0.01;

interface FlatArc {
  readonly lon: Float64Array;
  readonly lat: Float64Array;
}

function polygonRings(geometry: GeometryObject<Properties>): ArcIndexes[] {
  switch (geometry.type) {
    case 'GeometryCollection':
      return geometry.geometries.flatMap(polygonRings);
    case 'Polygon':
      return geometry.arcs;
    case 'MultiPolygon':
      return geometry.arcs.flat();
    default:
      return [];
  }
}

/** Rings whose orientation the simplification reversed or flattened; a negative arc index runs that arc backwards, as in TopoJSON. */
function turnedRings(rings: readonly ArcIndexes[], detailed: readonly number[], simplified: readonly number[]): ArcIndexes[] {
  const ringArea = (ring: ArcIndexes, shoelaces: readonly number[]) =>
    ring.reduce((sum, index) => {
      const area = shoelaces[arcIndex(index)] ?? missingArc(index);
      return index < 0 ? sum - area : sum + area;
    }, 0);
  return rings.filter((ring) => {
    const before = Math.sign(ringArea(ring, detailed));
    return before !== 0 && Math.sign(ringArea(ring, simplified)) !== before;
  });
}

/** Twice the signed area under the arc's points (all of them, or those `kept`) in longitude and latitude. */
function shoelace({ lon, lat }: FlatArc, kept: Uint8Array | null): number {
  let sum = 0;
  let previous = 0;
  for (let point = 1; point < lon.length; point++) {
    if (kept !== null && kept[point] === 0) continue;
    sum += at(lon, previous) * at(lat, point) - at(lon, point) * at(lat, previous);
    previous = point;
  }
  return sum;
}

function arcIndex(index: number): number {
  return index < 0 ? ~index : index;
}

function missingArc(index: number): never {
  throw new RangeError(`arc ${index} is not in the topology`);
}

function at(values: Float64Array, index: number): number {
  const value = values[index];
  if (value === undefined) throw new RangeError(`arc point ${index} is out of range`);
  return value;
}

function absoluteArcs(topology: Topology): FlatArc[] {
  const transform = topology.transform;
  return topology.arcs.map((arc) => {
    const lon = new Float64Array(arc.length);
    const lat = new Float64Array(arc.length);
    let x = 0;
    let y = 0;
    arc.forEach(([arcX, arcY], index) => {
      if (arcX === undefined || arcY === undefined) throw new TypeError('an arc position lacks a coordinate');
      if (transform === undefined) {
        lon[index] = arcX;
        lat[index] = arcY;
        return;
      }
      x += arcX;
      y += arcY;
      lon[index] = x * transform.scale[0] + transform.translate[0];
      lat[index] = y * transform.scale[1] + transform.translate[1];
    });
    return { lon, lat };
  });
}

function keptPositions({ lon, lat }: FlatArc, kept: Uint8Array): Position[] {
  const positions: Position[] = [];
  for (let point = 0; point < lon.length; point++) if (kept[point] === 1) positions.push([at(lon, point), at(lat, point)]);
  return positions;
}

function keptPoints(arc: FlatArc, minArea: number): Uint8Array {
  const count = arc.lon.length;
  const kept = new Uint8Array(count).fill(1);
  if (count <= 2) return kept;
  const weights = pointWeights(arc);
  let keptInterior = 0;
  for (let point = 1; point < count - 1; point++) {
    const keep = at(weights, point) >= minArea || onMapEdge(at(arc.lon, point), at(arc.lat, point));
    kept[point] = keep ? 1 : 0;
    if (keep) keptInterior++;
  }
  const closed = at(arc.lon, 0) === at(arc.lon, count - 1) && at(arc.lat, 0) === at(arc.lat, count - 1);
  const interiorToKeep = Math.min(count - 2, closed ? 2 : 1);
  for (; keptInterior < interiorToKeep; keptInterior++) kept[heaviestDropped(weights, kept)] = 1;
  return kept;
}

function heaviestDropped(weights: Float64Array, kept: Uint8Array): number {
  let heaviest = -1;
  for (let point = 1; point < kept.length - 1; point++) {
    if (kept[point] === 0 && (heaviest === -1 || at(weights, point) > at(weights, heaviest))) heaviest = point;
  }
  if (heaviest === -1) throw new RangeError('every interior point is kept already');
  return heaviest;
}

function onMapEdge(lon: number, lat: number): boolean {
  return Math.abs(lon) >= 180 - EDGE_TOLERANCE_DEGREES || Math.abs(lat) >= 90 - EDGE_TOLERANCE_DEGREES;
}

/** Each point's Visvalingam weight; the ends weigh infinitely much. */
function pointWeights({ lon, lat }: FlatArc): Float64Array {
  const count = lon.length;
  const weights = new Float64Array(count).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(count);
  const next = new Int32Array(count);
  const latitudeFactor = new Float64Array(count);
  for (let point = 0; point < count; point++) {
    previous[point] = point - 1;
    next[point] = point + 1;
    latitudeFactor[point] = Math.cos((at(lat, point) * Math.PI) / 180);
  }
  const triangleArea = (first: number, middle: number, last: number) => {
    const ax = at(lon, first);
    const ay = at(lat, first);
    const area = Math.abs((at(lon, middle) - ax) * (at(lat, last) - ay) - (at(lon, last) - ax) * (at(lat, middle) - ay)) / 2;
    return area * at(latitudeFactor, middle);
  };
  const heap = new WeightHeap(count);
  for (let point = 1; point < count - 1; point++) heap.push(point, triangleArea(point - 1, point, point + 1));
  let heaviestRemoved = 0;
  while (heap.size > 0) {
    const point = heap.pop();
    heaviestRemoved = Math.max(heap.lastWeight, heaviestRemoved);
    weights[point] = heaviestRemoved;
    const before = previous[point] ?? missingPoint(point);
    const after = next[point] ?? missingPoint(point);
    next[before] = after;
    previous[after] = before;
    if (before > 0) heap.update(before, triangleArea(previous[before] ?? missingPoint(before), before, after));
    if (after < count - 1) heap.update(after, triangleArea(before, after, next[after] ?? missingPoint(after)));
  }
  return weights;
}

function missingPoint(point: number): never {
  throw new RangeError(`arc point ${point} has no neighbours`);
}

/** A binary min-heap of arc point indices by weight, with in-place updates; ties go to the lower index, so results are deterministic. */
class WeightHeap {
  private readonly indices: Int32Array;
  private readonly weights: Float64Array;
  private readonly slots: Int32Array;
  size = 0;
  lastWeight = 0;

  constructor(capacity: number) {
    this.indices = new Int32Array(capacity);
    this.weights = new Float64Array(capacity);
    this.slots = new Int32Array(capacity).fill(-1);
  }

  push(index: number, weight: number) {
    this.weights[index] = weight;
    this.indices[this.size] = index;
    this.slots[index] = this.size;
    this.size++;
    this.siftUp(this.size - 1);
  }

  pop(): number {
    const top = this.at(0);
    this.lastWeight = this.weightOf(top);
    this.size--;
    const last = this.at(this.size);
    this.slots[top] = -1;
    if (this.size > 0) {
      this.place(last, 0);
      this.siftDown(0);
    }
    return top;
  }

  update(index: number, weight: number) {
    const slot = this.slots[index] ?? -1;
    if (slot < 0) throw new RangeError(`point ${index} is not in the heap`);
    this.weights[index] = weight;
    this.siftUp(slot);
    this.siftDown(this.slots[index] ?? slot);
  }

  private at(slot: number): number {
    const index = this.indices[slot];
    if (index === undefined) throw new RangeError(`heap slot ${slot} is out of range`);
    return index;
  }

  private weightOf(index: number): number {
    const weight = this.weights[index];
    if (weight === undefined) throw new RangeError(`point ${index} has no weight`);
    return weight;
  }

  private lighter(a: number, b: number): boolean {
    const weightA = this.weightOf(a);
    const weightB = this.weightOf(b);
    return weightA < weightB || (weightA === weightB && a < b);
  }

  private place(index: number, slot: number) {
    this.indices[slot] = index;
    this.slots[index] = slot;
  }

  private siftUp(start: number) {
    let slot = start;
    const index = this.at(slot);
    while (slot > 0) {
      const parentSlot = (slot - 1) >> 1;
      const parent = this.at(parentSlot);
      if (!this.lighter(index, parent)) break;
      this.place(parent, slot);
      slot = parentSlot;
    }
    this.place(index, slot);
  }

  private siftDown(start: number) {
    let slot = start;
    const index = this.at(slot);
    for (;;) {
      const left = 2 * slot + 1;
      if (left >= this.size) break;
      const right = left + 1;
      const child = right < this.size && this.lighter(this.at(right), this.at(left)) ? right : left;
      if (!this.lighter(this.at(child), index)) break;
      this.place(this.at(child), slot);
      slot = child;
    }
    this.place(index, slot);
  }
}
