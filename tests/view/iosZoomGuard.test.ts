import { describe, expect, it } from 'vitest';
import { IOS_ZOOM_GUARD_CLASS, SHOWN_SIZE_RATIO, needsIosZoomGuard, shrunkControlMarginRight } from '../../src/view/iosZoomGuard.ts';
import { readText } from '../helpers.ts';

describe('iOS zoom guard', () => {
  it('applies only where -webkit-touch-callout is supported', () => {
    const asked: string[] = [];
    const supportsOnly = (supported: string) => (property: string, value: string) => {
      asked.push(`${property}: ${value}`);
      return property === supported;
    };
    expect(needsIosZoomGuard(supportsOnly('-webkit-touch-callout'))).toBe(true);
    expect(needsIosZoomGuard(supportsOnly('appearance'))).toBe(false);
    expect(asked).toEqual(['-webkit-touch-callout: none', '-webkit-touch-callout: none']);
  });

  it('hands back the width the shrink frees', () => {
    expect(shrunkControlMarginRight(160)).toBe(-40);
    expect(160 + shrunkControlMarginRight(160)).toBe(160 * SHOWN_SIZE_RATIO);
  });

  it('rejects a width that is no length', () => {
    for (const width of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => shrunkControlMarginRight(width)).toThrow();
  });

  it('shrinks the control in the stylesheet by the same ratio', () => {
    const css = readText('src/styles.css');
    const rule = css.match(new RegExp(String.raw`\.${IOS_ZOOM_GUARD_CLASS} \.preset-select \{([^}]*)\}`))?.[1];
    if (rule === undefined) throw new Error(`src/styles.css has no .${IOS_ZOOM_GUARD_CLASS} .preset-select rule`);
    expect(rule).toContain(`transform: scale(${SHOWN_SIZE_RATIO});`);
    expect(rule).toContain('font-size: 16px;');
    expect(rule).toContain('margin-right: var(--shrunk-margin-right);');
  });
});
