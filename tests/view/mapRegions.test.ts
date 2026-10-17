import { describe, expect, it } from 'vitest';
import type { BandFile } from '../../src/data/types.ts';
import { buildBandEntries, showRefs } from '../../src/model.ts';
import { computeMapFit } from '../../src/view/geoFit.ts';
import { MAP_REGIONS, distanceKm, findRegion, radiusDegrees, regionPoints, showsWithin } from '../../src/view/mapRegions.ts';
import { makeFile, makeShow } from '../helpers.ts';

describe('map regions', () => {
  it('samples the outline of each region', () => {
    const europe = findRegion('europe');
    if (europe === undefined) throw new Error('europe missing');
    const points = regionPoints(europe);
    expect(points).toContainEqual([-25, 34]);
    expect(points).toContainEqual([45, 71]);
    expect(points.length).toBeGreaterThan(8);
  });

  it('fits every region into the viewport', () => {
    for (const region of MAP_REGIONS) {
      const fit = computeMapFit(regionPoints(region), { width: 1000, height: 600, padding: 32, minSpanKm: 300 });
      expect(Number.isFinite(fit.scale), region.id).toBe(true);
    }
  });

  it('finds shows within a radius', () => {
    const file = makeFile([
      makeShow(),
      makeShow({ id: 'test-band-2026-11-03-potsdam', date: '2026-11-03', city: 'Potsdam', geo: { lat: 52.3906, lon: 13.0645, precision: 'city', source: 'manual' } }),
      makeShow({ id: 'test-band-2026-11-05-hamburg', date: '2026-11-05', city: 'Hamburg', geo: { lat: 53.5511, lon: 9.9937, precision: 'city', source: 'manual' } }),
    ]) as BandFile;
    const [band] = buildBandEntries([file], []);
    if (band === undefined) throw new Error('band missing');
    const refs = showRefs(band, '2026-10-16');
    const berlin: [number, number] = [13.405, 52.52];
    expect(showsWithin(refs, berlin, 50).map((ref) => ref.show.city)).toEqual(['Berlin', 'Potsdam']);
    expect(distanceKm(berlin, [9.9937, 53.5511])).toBeCloseTo(255, -1);
    expect(radiusDegrees(111.19)).toBeCloseTo(1, 2);
  });
});
