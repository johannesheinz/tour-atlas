import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { quantize } from 'topojson-client';
import type { Plugin } from 'vite';
import { asWorldTopology, type WorldTopology } from '../../src/data/countryLocator.ts';

const MODULE_ID = 'virtual:world-topology';
const RESOLVED_ID = `\0${MODULE_ID}`;

/** About 0.007° longitude: under 3 px at the closest automatic zoom. Saves ~30 kB gzipped. */
const QUANTIZATION = 5e4;

/** Serves world-atlas countries-50m without country names, re-quantized for size. */
export function worldTopologyPlugin(): Plugin {
  return {
    name: 'tour-atlas:world-topology',
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(slimWorldTopology()))});`;
    },
  };
}

export function slimWorldTopology(): WorldTopology {
  const require = createRequire(import.meta.url);
  const source = asWorldTopology(JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8')));
  const { bbox, transform } = source;
  if (bbox === undefined || transform === undefined) throw new Error('world-atlas topology is expected to be quantized with a bbox');

  const [scaleX, scaleY] = transform.scale;
  const [translateX, translateY] = transform.translate;
  const absoluteArcs = source.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx = 0, dy = 0]) => {
      x += dx;
      y += dy;
      return [x * scaleX + translateX, y * scaleY + translateY];
    });
  });

  const [west, south, east, north] = bbox;
  const withoutNames: WorldTopology = {
    type: 'Topology',
    bbox,
    arcs: absoluteArcs,
    objects: {
      countries: {
        ...source.objects.countries,
        geometries: source.objects.countries.geometries.map(({ properties: _properties, ...geometry }) => geometry),
      },
      land: source.objects.land,
    },
  };
  return quantize(withoutNames, {
    scale: [(east - west) / (QUANTIZATION - 1), (north - south) / (QUANTIZATION - 1)],
    translate: [west, south],
  });
}
