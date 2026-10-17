import { describe, expect, it } from 'vitest';
import type { BandFile } from '../../src/data/types.ts';
import { buildBandEntries, showRefs } from '../../src/model.ts';
import { MAX_SEGMENTS, annularSectorPath, pinSegments } from '../../src/view/pinSegments.ts';
import { makeFile, makeShow } from '../helpers.ts';

function refsFor(counts: readonly number[]) {
  const files = counts.map((count, bandIndex) =>
    makeFile(
      Array.from({ length: count }, (_, showIndex) => makeShow({ id: `band-${bandIndex}-2026-11-${String(showIndex + 1).padStart(2, '0')}-berlin` })),
      `band-${bandIndex}`,
    ) as BandFile,
  );
  return buildBandEntries(files, []).flatMap((band) => showRefs(band, '2026-10-16'));
}

describe('pinSegments', () => {
  it('splits the ring by show count, biggest band first, starting at the top', () => {
    const segments = pinSegments(refsFor([1, 3]), 'light', '#888888');
    expect(segments.map((segment) => segment.bandId)).toEqual(['band-1', 'band-0']);
    expect(segments[0]?.startAngle).toBeCloseTo(-Math.PI / 2);
    expect((segments[0]?.endAngle ?? 0) - (segments[0]?.startAngle ?? 0)).toBeCloseTo(Math.PI * 1.5);
    expect(segments.at(-1)?.endAngle).toBeCloseTo(Math.PI * 1.5);
  });

  it('folds small bands into one other segment', () => {
    const segments = pinSegments(refsFor([5, 4, 3, 3, 2, 2, 1, 1]), 'dark', '#888888');
    expect(segments).toHaveLength(MAX_SEGMENTS);
    expect(segments.at(-1)).toMatchObject({ bandId: null, color: '#888888' });
  });

  it('draws an annular sector path', () => {
    const path = annularSectorPath(3, 8, -Math.PI / 2, 0);
    expect(path.startsWith('M 0.000 -8.000 A 8 8 0 0 1 8.000 0.000 L 3.000 0.000 A 3 3 0 0 0')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
  });
});
