import type { Band } from './types.ts';

export interface BandColor {
  readonly light: string;
  readonly dark: string;
}

/** Validated categorical order (adjacent-pair CVD ΔE ≥ 8 in both modes). Order is part of the contract. */
export const CATEGORICAL_PALETTE: readonly BandColor[] = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
  { light: '#e87ba4', dark: '#d55181' },
  { light: '#008300', dark: '#008300' },
  { light: '#6250d6', dark: '#9085e9' },
  { light: '#e34948', dark: '#e66767' },
];

const FALLBACK_LIGHTNESS = { light: 0.58, dark: 0.68 } as const;
const FALLBACK_CHROMA = 0.14;

/**
 * Explicit band.color wins. Bands without one take palette slots in band-id order;
 * once the palette is used up, a hue is derived from a hash of the id.
 * Assignment covers all bands, so hiding a band never repaints the others.
 */
export function assignBandColors(bands: readonly Band[]): ReadonlyMap<string, BandColor> {
  return extendBandColors(new Map(), bands);
}

/**
 * Adds colours for `bands` without changing any colour already in `existing`:
 * new bands take the palette slots still free, then hashed hues; an explicit band.color always wins.
 * Used so previews never repaint published bands.
 */
export function extendBandColors(existing: ReadonlyMap<string, BandColor>, bands: readonly Band[]): ReadonlyMap<string, BandColor> {
  const colors = new Map(existing);
  const taken = new Set([...existing.values()]);
  const freeSlots = CATEGORICAL_PALETTE.filter((slot) => !taken.has(slot));
  const withoutColor = bands
    .filter((band) => band.color === null && !colors.has(band.id))
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
  withoutColor.forEach((band, index) => {
    colors.set(band.id, freeSlots[index] ?? hashedColor(band.id));
  });
  for (const band of bands) {
    if (band.color !== null) colors.set(band.id, { light: band.color, dark: band.color });
  }
  return colors;
}

export function hashedColor(id: string): BandColor {
  const hue = fnv1a(id) % 360;
  return {
    light: oklchToHex(FALLBACK_LIGHTNESS.light, FALLBACK_CHROMA, hue),
    dark: oklchToHex(FALLBACK_LIGHTNESS.dark, FALLBACK_CHROMA, hue),
  };
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Reduces chroma until the colour fits sRGB. */
export function oklchToHex(lightness: number, chroma: number, hueDegrees: number): string {
  for (let c = chroma; c >= 0; c -= 0.005) {
    const rgb = oklchToLinearSrgb(lightness, c, hueDegrees);
    if (rgb.every((channel) => channel >= 0 && channel <= 1)) {
      return `#${rgb.map((channel) => Math.round(gammaEncode(channel) * 255).toString(16).padStart(2, '0')).join('')}`;
    }
  }
  throw new RangeError(`lightness ${lightness} has no in-gamut colour`);
}

function oklchToLinearSrgb(lightness: number, chroma: number, hueDegrees: number): [number, number, number] {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function gammaEncode(linear: number): number {
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
}
