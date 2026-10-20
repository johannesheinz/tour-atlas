import { geoArea } from 'd3-geo';
import type { MultiPolygon, Polygon } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import { describe, expect, it } from 'vitest';
import { COARSE_WORLD_SETTINGS, countArcPoints, simplifyTopology, worldDetailAt } from '../../src/view/simplifyTopology.ts';
import { slimWorldTopology } from '../../tools/vite/worldTopology.ts';

type Position = [number, number];

function topologyOf(arcs: Position[][], rings: number[][] = []): Topology {
  return {
    type: 'Topology',
    arcs,
    objects: { shapes: { type: 'GeometryCollection', geometries: rings.map((ring) => ({ type: 'Polygon', arcs: [ring] })) } },
  };
}

/** A wiggly line along the equator: every interior point is light compared with a large threshold. */
function wiggle(count: number, amplitude: number): Position[] {
  return Array.from({ length: count }, (_, index): Position => [index, index % 2 === 0 ? 0 : amplitude]);
}

function signedArea(ring: readonly Position[]): number {
  let twiceArea = 0;
  for (let index = 1; index < ring.length; index++) {
    const [px, py] = ring[index - 1] as Position;
    const [x, y] = ring[index] as Position;
    twiceArea += px * y - x * py;
  }
  return twiceArea / 2;
}

describe('simplifyTopology', () => {
  it('keeps both ends of every arc and drops light points', () => {
    const line = wiggle(41, 0.01);
    const [simplified] = simplifyTopology(topologyOf([line]), 1).arcs;
    expect(simplified?.[0]).toEqual(line[0]);
    expect(simplified?.at(-1)).toEqual(line.at(-1));
    expect(simplified).toHaveLength(3);
  });

  it('keeps points that weigh at least the threshold', () => {
    const line: Position[] = [[0, 0], [1, 0.001], [3, 5], [5, 0.001], [6, 0]];
    const [simplified] = simplifyTopology(topologyOf([line]), 3).arcs;
    expect(simplified).toEqual([[0, 0], [3, 5], [6, 0]]);
  });

  it('weighs points by area shrunk with the cosine of their latitude', () => {
    const zigzag = (latitude: number): Position[] => [0, 1, 2, 3, 4].map((lon): Position => [lon, latitude + (lon % 2) * 0.4]);
    const [equator, nearPole] = simplifyTopology(topologyOf([zigzag(0), zigzag(80)]), 0.3).arcs;
    expect(equator).toHaveLength(5);
    expect(nearPole).toHaveLength(3);
  });

  it('keeps an island that closes on itself as a triangle at least, turning the same way', () => {
    const island: Position[] = [[0, 0], [0.01, 0], [0.02, 0.001], [0.02, 0.01], [0.01, 0.012], [0, 0.01], [0, 0]];
    const [simplified] = simplifyTopology(topologyOf([island], [[0]]), 10).arcs;
    expect(simplified).toHaveLength(4);
    expect(simplified?.[0]).toEqual(simplified?.at(-1));
    expect(Math.sign(signedArea(simplified as Position[]))).toBe(Math.sign(signedArea(island)));
  });

  it('keeps a concave island whole rather than turning its ring the other way round', () => {
    // A C-shaped island starting at a tip, whose two heaviest interior points make a triangle turning the other way.
    const island: Position[] = [[3, 0], [3, 1], [1, 1], [1, 2], [3, 2], [3, 3], [0, 3], [0, 0], [3, 0]];
    const minArea = 100;
    const unchecked = simplifyTopology(topologyOf([island]), minArea).arcs[0] as Position[];
    expect(Math.sign(signedArea(unchecked))).not.toBe(Math.sign(signedArea(island)));
    expect(simplifyTopology(topologyOf([island], [[0]]), minArea).arcs[0]).toEqual(island);
  });

  it('keeps one interior point of each open arc, so a ring of two arcs keeps four corners', () => {
    const north: Position[] = [[0, 0], [0.005, 0.004], [0.01, 0.005], [0.015, 0.004], [0.02, 0]];
    const south: Position[] = [[0.02, 0], [0.015, -0.004], [0.01, -0.005], [0.005, -0.004], [0, 0]];
    const arcs = simplifyTopology(topologyOf([north, south], [[0, 1]]), 10).arcs;
    expect(arcs.map((arc) => arc.length)).toEqual([3, 3]);
  });

  it('keeps points on the antimeridian and at the poles', () => {
    const edge: Position[] = [[170, -89.999], [175, -89.999], [180, -89.999], [180, -80], [180, -70], [179, -60]];
    const [simplified] = simplifyTopology(topologyOf([edge]), 1000).arcs;
    expect(simplified).toEqual(edge);
  });

  it('reads quantized, delta-encoded arcs', () => {
    const quantized: Topology = { ...topologyOf([[[0, 0], [10, 1], [10, -1], [10, 0]]]), transform: { scale: [0.5, 2], translate: [100, 10] } };
    const simplified = simplifyTopology(quantized, 1e-9);
    expect(simplified.transform).toBeUndefined();
    expect(simplified.arcs[0]).toEqual([[100, 10], [105, 12], [110, 10], [115, 10]]);
  });

  it('rejects a threshold that is not a positive area', () => {
    expect(() => simplifyTopology(topologyOf([wiggle(5, 1)]), 0)).toThrow(RangeError);
    expect(() => simplifyTopology(topologyOf([wiggle(5, 1)]), Number.NaN)).toThrow(RangeError);
  });

  describe('on the world map', () => {
    const world = slimWorldTopology();
    const coarse = simplifyTopology(world, COARSE_WORLD_SETTINGS.minAreaSquareDegrees);

    it('needs about a sixth of the points', () => {
      const ratio = countArcPoints(world) / countArcPoints(coarse);
      expect(ratio).toBeGreaterThan(5.5);
      expect(ratio).toBeLessThan(7);
    });

    it('keeps every arc end, so borders still meet the coastlines', () => {
      const detailed = simplifyTopology(world, Number.MIN_VALUE).arcs;
      coarse.arcs.forEach((arc, index) => {
        expect(arc[0]).toEqual(detailed[index]?.[0]);
        expect(arc.at(-1)).toEqual(detailed[index]?.at(-1));
      });
    });

    it('keeps every land ring, turning the same way', () => {
      const rings = (topology: typeof world) =>
        feature(topology, topology.objects.land).features.flatMap(({ geometry }) => {
          const polygons = (geometry as Polygon | MultiPolygon).type === 'Polygon' ? [(geometry as Polygon).coordinates] : (geometry as MultiPolygon).coordinates;
          return polygons.flat();
        });
      const before = rings(world);
      const after = rings(coarse);
      expect(after).toHaveLength(before.length);
      after.forEach((ring, index) => {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        const coversMostOfTheSphere = (positions: typeof ring) => geoArea({ type: 'Polygon', coordinates: [positions] }) > 2 * Math.PI;
        expect(coversMostOfTheSphere(ring)).toBe(coversMostOfTheSphere(before[index] ?? []));
      });
    });

    it('draws the same borders', () => {
      const borders = (topology: typeof world) => mesh(topology, topology.objects.countries, (a, b) => a !== b).coordinates.length;
      expect(borders(coarse)).toBe(borders(world));
    });

    it('returns the same result when run again or on its own output', () => {
      expect(simplifyTopology(world, COARSE_WORLD_SETTINGS.minAreaSquareDegrees)).toEqual(coarse);
      expect(simplifyTopology(coarse, COARSE_WORLD_SETTINGS.minAreaSquareDegrees)).toEqual(coarse);
    });
  });
});

describe('worldDetailAt', () => {
  it('draws the coarse world at whole-world scales and the detailed one when zoomed in', () => {
    expect(worldDetailAt(72, 3)).toBe('coarse');
    expect(worldDetailAt(170, 1)).toBe('coarse');
    expect(worldDetailAt(170, 2)).toBe('detailed');
    expect(worldDetailAt(400, 1)).toBe('detailed');
  });

  it('keeps what the coarse world drops below the pixel area it allows', () => {
    const { minAreaSquareDegrees, maxDevicePixelArea } = COARSE_WORLD_SETTINGS;
    const coarseScales = Array.from({ length: 1000 }, (_, step) => step + 1).filter((scale) => worldDetailAt(scale, 1) === 'coarse');
    const largestCoarse = Math.max(...coarseScales);
    const droppedAreaPx = (scale: number) => minAreaSquareDegrees * ((scale * Math.PI) / 180) ** 2;
    expect(droppedAreaPx(largestCoarse)).toBeLessThanOrEqual(maxDevicePixelArea);
    expect(droppedAreaPx(largestCoarse + 1)).toBeGreaterThan(maxDevicePixelArea);
  });

  it('rejects scales and pixel ratios that are not positive', () => {
    expect(() => worldDetailAt(0, 1)).toThrow(RangeError);
    expect(() => worldDetailAt(100, 0)).toThrow(RangeError);
  });
});
