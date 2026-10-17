import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkBandFiles } from '../../tools/shared/bandFiles.ts';
import { makeFile, makeShow } from '../helpers.ts';

describe('checkBandFiles', () => {
  it('reports lint warnings with the row numbers of the file, even after rejected rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tour-atlas-'));
    const path = join(directory, 'test-band.json');
    const broken = { ...makeShow({ id: 'test-band-2026-11-01-berlin', date: '2026-11-01' }), geo: null };
    const berlin = makeShow();
    const paris = makeShow({ id: 'test-band-2026-11-02-paris', city: 'Paris', countryCode: 'FR', geo: { lat: 48.8566, lon: 2.3522, precision: 'city', source: 'manual' } });
    writeFileSync(path, JSON.stringify(makeFile([broken, berlin, paris])));

    const [checked] = checkBandFiles([path], { mode: 'repository', today: '2026-10-16', locateCountry: null });
    expect(checked?.errors.map((issue) => issue.path)).toEqual(['shows[0].geo']);
    expect(checked?.warnings.map((issue) => [issue.path, issue.message])).toEqual([
      ['shows[2].date', 'same day as shows[1] (Berlin) but 877 km away; check the date'],
    ]);
  });
});
