import { describe, expect, it } from 'vitest';
import type { BandFile } from '../../src/data/types.ts';
import { exportAll, mergePreviews, normalizedFileText, processPreviewFile } from '../../src/preview.ts';
import { readJson, readText } from '../helpers.ts';

const options = { today: '2026-10-16', locateCountry: null };
const glassHarbor = readJson('samples/glass-harbor.json') as BandFile;

describe('processPreviewFile', () => {
  it('accepts a valid file with no changes against the published version', () => {
    const preview = processPreviewFile('glass-harbor.json', readText('samples/glass-harbor.json'), glassHarbor, options);
    expect(preview.status).toBe('valid');
    expect(preview.errors).toEqual([]);
    expect(preview.diff?.added).toEqual([]);
    expect(preview.diff?.unchangedCount).toBe(24);
    expect(normalizedFileText(preview)).toBe(readText('samples/glass-harbor.json'));
  });

  it('keeps valid rows of a partly broken file and reports each bad row', () => {
    const preview = processPreviewFile('broken-lanterns.json', readText('samples/broken-lanterns.json'), undefined, options);
    expect(preview.status).toBe('partial');
    expect(preview.errors.length).toBeGreaterThanOrEqual(14);
    expect(preview.displayable?.shows.map((show) => show.city)).toEqual(['Berlin']);
    expect(preview.diff?.isNewBand).toBe(true);
  });

  it('generates ids for a draft and holds back rows without coordinates', () => {
    const preview = processPreviewFile('ashen-choir (1).json', readText('samples/draft/ashen-choir.json'), undefined, options);
    expect(preview.status).toBe('valid');
    expect(preview.missingGeoCount).toBe(6);
    expect(preview.displayable?.shows).toEqual([]);
    expect(preview.normalized?.shows[0]?.id).toBe('ashen-choir-2027-03-04-helsinki');
    expect(preview.warnings.map((warning) => warning.message)).toEqual([
      'will be downloaded as "ashen-choir.json" to match band.id',
      '6 shows have no coordinates yet and are not drawn; run "npm run geocode" before committing',
    ]);
  });

  it('diffs a changed show by id', () => {
    const [first, ...rest] = glassHarbor.shows;
    if (first === undefined) throw new Error('fixture has no shows');
    const edited = { ...glassHarbor, shows: [{ ...first, status: 'cancelled' }, ...rest] };
    const preview = processPreviewFile('glass-harbor.json', JSON.stringify(edited), glassHarbor, options);
    expect(preview.diff?.changed.map((change) => change.fields)).toEqual([['status']]);
  });

  it('rejects unparseable and oversized files', () => {
    expect(processPreviewFile('x.json', '{', undefined, options).status).toBe('invalid');
    expect(processPreviewFile('x.json', ' '.repeat(5_000_001), undefined, options).errors[0]?.message).toContain('larger than 5 MB');
  });
});

describe('mergePreviews and exportAll', () => {
  const preview = (text: string, name = 'glass-harbor.json') => processPreviewFile(name, text, glassHarbor, options);

  it('replaces an earlier preview of the same band', () => {
    const first = preview(readText('samples/glass-harbor.json'));
    const second = preview(readText('samples/glass-harbor.json'), 'glass-harbor (2).json');
    expect(mergePreviews([first], [second]).map((item) => item.fileName)).toEqual(['glass-harbor (2).json']);
  });

  it('exports published bands with previews in their place, sorted by id', () => {
    const iron = readJson('samples/iron-lantern.json') as BandFile;
    const exported = JSON.parse(exportAll([iron, glassHarbor], [preview(readText('samples/glass-harbor.json'))])) as BandFile[];
    expect(exported.map((file) => file.band.id)).toEqual(['glass-harbor', 'iron-lantern']);
  });
});
