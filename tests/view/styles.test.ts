import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, STYLES, type Style } from '../../src/data/styles.ts';
import { ROOT, readText } from '../helpers.ts';

const CSS = readText('src/styles.css').replaceAll(/\/\*[\s\S]*?\*\//g, '');

/** Custom properties the code sets on elements, such as a band's swatch colour or a cursor position. */
const SET_BY_CODE = new Set(
  readdirSync(join(ROOT, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) => [...readText(join('src', file)).matchAll(/setProperty\('(--[\w-]+)'/g)].map((match) => match[1])),
);

type Tokens = ReadonlyMap<string, string>;

function tokenBlock(selector: string): Tokens {
  const blocks = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => match[1]?.trim() === selector && match[2]?.includes('--stock'));
  const [block] = blocks;
  if (block === undefined || blocks.length > 1) throw new Error(`expected one token block for ${selector}, found ${blocks.length}`);
  return new Map([...(block[2] ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((declaration) => [declaration[1] ?? '', (declaration[2] ?? '').trim()]));
}

function rootOf(style: Style): string {
  return style === DEFAULT_STYLE ? ':root' : `:root[data-style='${style}']`;
}

const light = (style: Style) => tokenBlock(rootOf(style));
const systemDark = (style: Style) => tokenBlock(`${rootOf(style)}:not([data-theme='light'])`);
const pickedDark = (style: Style) => tokenBlock(`${rootOf(style)}[data-theme='dark']`);

function colour(tokens: Tokens, name: string): string {
  const value = tokens.get(name);
  if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} should be a #rrggbb colour, is ${value ?? 'missing'}`);
  return value;
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** WCAG AA: 4.5 for text, 3 for the outlines that identify a control. */
const PAIRS: readonly (readonly [foreground: string, backgrounds: readonly string[], minimum: number])[] = [
  ['--ink', ['--stock', '--stock-deep', '--panel', '--page'], 4.5],
  ['--ink-soft', ['--stock', '--panel', '--page'], 4.5],
  ['--ink-muted', ['--stock', '--panel', '--page'], 4.5],
  ['--accent', ['--stock', '--panel'], 4.5],
  ['--on-hover-fill', ['--hover-fill'], 4.5],
  ['--on-selected-fill', ['--selected-fill'], 4.5],
  ['--control-line', ['--stock', '--panel', '--page'], 3],
];

describe('styles', () => {
  it('sets every token in every style, light and dark', () => {
    const lightKeys = [...light(DEFAULT_STYLE).keys()].toSorted();
    const darkKeys = [...systemDark(DEFAULT_STYLE).keys()].toSorted();
    for (const style of STYLES) {
      expect([...light(style).keys()].toSorted(), style).toEqual(lightKeys);
      expect([...systemDark(style).keys()].toSorted(), style).toEqual(darkKeys);
      expect(pickedDark(style), `${style}: a picked dark theme matches the system's`).toEqual(systemDark(style));
    }
    expect(darkKeys.filter((key) => !lightKeys.includes(key))).toEqual([]);
  });

  it('uses no token that no block defines', () => {
    const defined = new Set([...CSS.matchAll(/(--[\w-]+):/g)].map((match) => match[1]));
    const used = new Set([...CSS.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]));
    expect([...used].filter((token) => !defined.has(token) && !SET_BY_CODE.has(token))).toEqual([]);
  });

  for (const style of STYLES) {
    for (const [mode, tokens] of [
      ['light', () => light(style)],
      ['dark', () => new Map([...light(style), ...systemDark(style)])],
    ] as const) {
      it(`${style} ${mode} meets WCAG AA contrast`, () => {
        const failures = PAIRS.flatMap(([foreground, backgrounds, minimum]) =>
          backgrounds.flatMap((background) => {
            const ratio = contrast(colour(tokens(), foreground), colour(tokens(), background));
            return ratio < minimum ? [`${foreground} on ${background}: ${ratio.toFixed(2)} < ${minimum}`] : [];
          }),
        );
        expect(failures).toEqual([]);
      });
    }
  }
});

describe('theme-color in index.html', () => {
  it("starts as Stage lights' panel for each system theme, as src/view/theme.ts later sets it", () => {
    const html = readText('index.html');
    const tag = (scheme: string) => new RegExp(`<meta name="theme-color" content="(#[0-9a-f]{6})" media="\\(prefers-color-scheme: ${scheme}\\)" />`).exec(html)?.[1];
    expect(tag('light')).toBe(colour(light(DEFAULT_STYLE), '--panel'));
    expect(tag('dark')).toBe(colour(systemDark(DEFAULT_STYLE), '--panel'));
  });
});
