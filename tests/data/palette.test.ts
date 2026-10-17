import { describe, expect, it } from 'vitest';
import { CATEGORICAL_PALETTE, assignBandColors, hashedColor, oklchToHex } from '../../src/data/palette';

const band = (id: string, color: string | null = null) => ({ id, name: id, color });

describe('assignBandColors', () => {
  it('assigns palette slots in band-id order, regardless of input order', () => {
    const colors = assignBandColors([band('zeta'), band('alpha'), band('mu')]);
    expect(colors.get('alpha')).toEqual(CATEGORICAL_PALETTE[0]);
    expect(colors.get('mu')).toEqual(CATEGORICAL_PALETTE[1]);
    expect(colors.get('zeta')).toEqual(CATEGORICAL_PALETTE[2]);
  });

  it('keeps explicit colours and does not spend palette slots on them', () => {
    const colors = assignBandColors([band('alpha', '#c0392b'), band('beta')]);
    expect(colors.get('alpha')).toEqual({ light: '#c0392b', dark: '#c0392b' });
    expect(colors.get('beta')).toEqual(CATEGORICAL_PALETTE[0]);
  });

  it('falls back to a deterministic hash after eight bands', () => {
    const bands = Array.from({ length: 10 }, (_, i) => band(`band-${String(i).padStart(2, '0')}`));
    const colors = assignBandColors(bands);
    expect(colors.get('band-07')).toEqual(CATEGORICAL_PALETTE[7]);
    expect(colors.get('band-08')).toEqual(hashedColor('band-08'));
    expect(hashedColor('band-08')).toEqual(hashedColor('band-08'));
    expect(hashedColor('band-08').light).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('oklchToHex', () => {
  it('converts known values', () => {
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
  });

  it('pulls out-of-gamut colours back into sRGB', () => {
    expect(oklchToHex(0.9, 0.4, 140)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
