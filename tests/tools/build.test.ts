import { describe, expect, it } from 'vitest';
import type { BandFile } from '../../src/data/types.ts';
import { StaticStore } from '../../src/store/StaticStore.ts';
import { injectContentSecurityPolicy } from '../../tools/vite/csp.ts';
import { slimWorldTopology } from '../../tools/vite/worldTopology.ts';
import { makeFile, makeShow } from '../helpers.ts';

describe('injectContentSecurityPolicy', () => {
  const html = '<head><meta charset="utf-8" /><script type="module">run()</script><style>body{}</style></head>';

  it('allows only the inlined script and style by hash and forbids network access', () => {
    const result = injectContentSecurityPolicy(html);
    expect(result).toContain("default-src 'none'");
    expect(result).toContain("connect-src 'none'");
    expect(result).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(result).toMatch(/style-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(result.indexOf('Content-Security-Policy')).toBeLessThan(result.indexOf('<script'));
  });

  it('refuses html without an inline script', () => {
    expect(() => injectContentSecurityPolicy('<head><meta charset="utf-8" /></head>')).toThrow(/no inline script/);
  });
});

describe('slimWorldTopology', () => {
  it('drops country names and keeps countries and land', () => {
    const topology = slimWorldTopology();
    expect(topology.objects.countries.geometries.every((geometry) => !('properties' in geometry))).toBe(true);
    expect(topology.objects.land.geometries.length).toBeGreaterThan(0);
    expect(topology.transform?.scale[0]).toBeCloseTo(360 / (5e4 - 1), 6);
  });
});

describe('StaticStore', () => {
  it('lists bands by id and finds them by id', () => {
    const store = new StaticStore([makeFile([makeShow()], 'zeta') as BandFile, makeFile([], 'alpha') as BandFile]);
    expect(store.listBands().map((file) => file.band.id)).toEqual(['alpha', 'zeta']);
    expect(store.getBand('zeta')?.shows).toHaveLength(1);
    expect(store.getBand('missing')).toBeUndefined();
  });
});
