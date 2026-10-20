import { geoEqualEarth, geoOrthographic, geoPath, type GeoProjection } from 'd3-geo';
import type { LineString } from 'geojson';
import { describe, expect, it } from 'vitest';
import { createRouteLineRecorder, pointAlongRoute, type RouteLine } from '../../src/view/routeLine.ts';

const GEO_PATH_DIGITS = 3;

const line = (coordinates: [number, number][]): LineString => ({ type: 'LineString', coordinates });

function recorded(projection: GeoProjection, route: LineString): RouteLine {
  const recorder = createRouteLineRecorder(GEO_PATH_DIGITS);
  geoPath(projection, recorder)(route);
  return recorder.finish();
}

function drawn(commands: (recorder: ReturnType<typeof createRouteLineRecorder>) => void): RouteLine {
  const recorder = createRouteLineRecorder(GEO_PATH_DIGITS);
  commands(recorder);
  return recorder.finish();
}

const flat = geoEqualEarth().scale(400).translate([500, 300]);
const STOCKHOLM_TO_MADRID = line([[18.07, 59.33], [-3.7, 40.42]]);
const TOKYO_TO_LOS_ANGELES = line([[139.69, 35.69], [-118.24, 34.05]]);
const SYDNEY_TO_AUCKLAND = line([[151.21, -33.87], [174.76, -36.85]]);
const globeOverEurope = geoOrthographic().clipAngle(90).rotate([-18, -50]).scale(300).translate([400, 400]);

describe('createRouteLineRecorder', () => {
  it('writes the same path data as geoPath for a great-circle leg', () => {
    expect(recorded(flat, STOCKHOLM_TO_MADRID).pathData).toBe(geoPath(flat)(STOCKHOLM_TO_MADRID));
  });

  it('writes the same path data as geoPath for a leg cut by the antimeridian', () => {
    const route = recorded(flat, TOKYO_TO_LOS_ANGELES);
    expect(route.pathData).toBe(geoPath(flat)(TOKYO_TO_LOS_ANGELES));
    expect(route.pathData.match(/M/g)).toHaveLength(2);
  });

  it('writes the same path data as geoPath for a leg cut by the globe edge', () => {
    expect(recorded(globeOverEurope, TOKYO_TO_LOS_ANGELES).pathData).toBe(geoPath(globeOverEurope)(TOKYO_TO_LOS_ANGELES));
  });

  it('records nothing for a leg on the far side of the globe', () => {
    const route = recorded(globeOverEurope, SYDNEY_TO_AUCKLAND);
    expect(route.pathData).toBe('');
    expect(route.length).toBe(0);
    expect(pointAlongRoute(route, 10)).toBeNull();
  });

  it('measures the drawn segments, not the jumps between subpaths', () => {
    const route = drawn((recorder) => {
      recorder.moveTo(0, 0);
      recorder.lineTo(3, 4);
      recorder.moveTo(100, 100);
      recorder.lineTo(100, 110);
    });
    expect(route.length).toBe(15);
    expect(route.pathData).toBe('M0,0L3,4M100,100L100,110');
  });

  it('measures the closing segment of a closed subpath', () => {
    const route = drawn((recorder) => {
      recorder.moveTo(0, 0);
      recorder.lineTo(10, 0);
      recorder.lineTo(10, 10);
      recorder.closePath();
    });
    expect(route.length).toBeCloseTo(20 + Math.SQRT2 * 10, 9);
    expect(route.pathData).toBe('M0,0L10,0L10,10Z');
  });

  it('starts empty again after finish', () => {
    const recorder = createRouteLineRecorder(GEO_PATH_DIGITS);
    recorder.moveTo(1, 1);
    recorder.lineTo(2, 2);
    recorder.finish();
    recorder.moveTo(5, 5);
    recorder.lineTo(5, 9);
    expect(recorder.finish()).toMatchObject({ pathData: 'M5,5L5,9', length: 4 });
  });

  it('rejects what a route line cannot be', () => {
    expect(() => createRouteLineRecorder(-1)).toThrow(RangeError);
    expect(() => createRouteLineRecorder(1.5)).toThrow(RangeError);
    expect(() => createRouteLineRecorder(GEO_PATH_DIGITS).lineTo(1, 1)).toThrow();
    expect(() => createRouteLineRecorder(GEO_PATH_DIGITS).closePath()).toThrow();
    expect(() => createRouteLineRecorder(GEO_PATH_DIGITS).arc(0, 0, 4.5, 0, Math.PI * 2)).toThrow();
  });
});

describe('pointAlongRoute', () => {
  const corner = drawn((recorder) => {
    recorder.moveTo(0, 0);
    recorder.lineTo(10, 0);
    recorder.lineTo(10, 20);
  });

  it('interpolates within the segment the distance falls on', () => {
    expect(pointAlongRoute(corner, 4)).toEqual([4, 0]);
    expect(pointAlongRoute(corner, 10)).toEqual([10, 0]);
    expect(pointAlongRoute(corner, 25)).toEqual([10, 15]);
  });

  it('clamps to the ends, like getPointAtLength', () => {
    expect(pointAlongRoute(corner, -5)).toEqual([0, 0]);
    expect(pointAlongRoute(corner, 1000)).toEqual([10, 20]);
  });

  it('continues on the next subpath after the drawn length of the first', () => {
    const cut = drawn((recorder) => {
      recorder.moveTo(0, 0);
      recorder.lineTo(10, 0);
      recorder.moveTo(50, 50);
      recorder.lineTo(50, 60);
    });
    expect(pointAlongRoute(cut, 5)).toEqual([5, 0]);
    expect(pointAlongRoute(cut, 15)).toEqual([50, 55]);
    expect(pointAlongRoute(cut, 20)).toEqual([50, 60]);
  });

  it('skips a subpath of a single point, which has no length', () => {
    const route = drawn((recorder) => {
      recorder.moveTo(7, 7);
      recorder.moveTo(0, 0);
      recorder.lineTo(0, 10);
    });
    expect(pointAlongRoute(route, 0)).toEqual([0, 0]);
    expect(pointAlongRoute(route, 4)).toEqual([0, 4]);
  });

  it('stays on the projected great circle all along a leg', () => {
    const route = recorded(flat, STOCKHOLM_TO_MADRID);
    for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const point = pointAlongRoute(route, route.length * progress);
      if (point === null) throw new Error('the leg has points');
      expect(distanceToPolyline(route, point)).toBeLessThan(1e-9);
    }
    expect(pointAlongRoute(route, 0)).toEqual(flat([18.07, 59.33])?.map((value) => Math.round(value * 1000) / 1000));
    expect(pointAlongRoute(route, route.length)).toEqual(flat([-3.7, 40.42])?.map((value) => Math.round(value * 1000) / 1000));
  });
});

function distanceToPolyline(route: RouteLine, [x, y]: readonly [number, number]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.xs.length; index++) {
    if (route.subpathStarts[index] === 1) continue;
    const [ax, ay, bx, by] = [route.xs[index - 1], route.ys[index - 1], route.xs[index], route.ys[index]].map(Number) as [number, number, number, number];
    const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2;
    const along = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / lengthSquared));
    best = Math.min(best, Math.hypot(x - (ax + along * (bx - ax)), y - (ay + along * (by - ay))));
  }
  return best;
}
