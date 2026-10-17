import { geoBounds, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { alpha2FromNumeric } from './countries.ts';

export type CountryLocator = (lon: number, lat: number) => string | null;
export type WorldTopology = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;

export function asWorldTopology(json: unknown): WorldTopology {
  if (typeof json !== 'object' || json === null || !('type' in json) || json.type !== 'Topology' || !('objects' in json)) {
    throw new TypeError('expected a TopoJSON topology');
  }
  const objects = json.objects;
  if (typeof objects !== 'object' || objects === null || !('countries' in objects) || !('land' in objects)) {
    throw new TypeError('expected a world-atlas topology with "countries" and "land" objects');
  }
  return json as WorldTopology;
}

/** Returns the ISO alpha-2 code of the country containing a point, or null (sea, disputed, unmapped). */
export function createCountryLocator(topology: WorldTopology): CountryLocator {
  const countries = feature(topology, topology.objects.countries).features.flatMap((country) => {
    const alpha2 = typeof country.id === 'string' ? alpha2FromNumeric(country.id) : null;
    if (alpha2 === null) return [];
    const [[west, south], [east, north]] = geoBounds(country);
    return [{ alpha2, country, west, south, east, north }];
  });

  return (lon, lat) => {
    for (const { alpha2, country, west, south, east, north } of countries) {
      if (lat < south || lat > north) continue;
      const insideLongitudes = west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
      if (insideLongitudes && geoContains(country, [lon, lat])) return alpha2;
    }
    return null;
  };
}
