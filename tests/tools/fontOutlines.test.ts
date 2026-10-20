import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadWoffFont } from '../../tools/shared/fontOutlines.ts';

const require = createRequire(import.meta.url);
const interTight = loadWoffFont(readFileSync(require.resolve('@fontsource/inter-tight/files/inter-tight-latin-700-normal.woff')));

describe('loadWoffFont', () => {
  it('outlines text as closed paths on the baseline', () => {
    const { d, width } = interTight.textPath('Tour Atlas', 100, 0);
    expect(d).toMatch(/^M[-\d. ]+[LQ]/);
    expect(d.match(/Z/g)?.length).toBeGreaterThanOrEqual(8);
    expect(width).toBeGreaterThan(300);
    expect(width).toBeLessThan(700);
  });

  it('kerns pairs from GPOS and adds letter spacing between letters only', () => {
    const kerned = interTight.textPath('To', 100, 0).width;
    const separate = interTight.textPath('T', 100, 0).width + interTight.textPath('o', 100, 0).width;
    expect(kerned).toBeLessThan(separate);
    expect(interTight.textPath('To', 100, 0.1).width).toBeCloseTo(kerned + 10, 5);
  });

  it('refuses characters the font cannot draw and files that are not WOFF', () => {
    expect(() => interTight.textPath('道', 100, 0)).toThrow(/no glyph for "道"/);
    expect(() => loadWoffFont(Buffer.from('not a font file at all, honestly, not one bit of it'))).toThrow(/not a WOFF 1.0 font/);
  });
});
