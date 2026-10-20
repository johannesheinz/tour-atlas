import { describe, expect, it } from 'vitest';
import { SHEET_SETTINGS, clampToSizes, releaseVelocity, sheetCover, sheetSizes, snapAfterDrag, steppedHeight, toggledHeight, type SheetSizes } from '../../src/view/sheetSnap.ts';

const PHONE: SheetSizes = { closed: 53, half: 380, full: 685 };

describe('sheet sizes', () => {
  it('closes to the handle, opens half to 45% of the window and fully to just below the search', () => {
    expect(sheetSizes({ viewportHeight: 844, handleHeight: 53, ceiling: 159, halfFloor: 363 })).toEqual(PHONE);
  });

  it('keeps half between closed and full on short windows', () => {
    expect(sheetSizes({ viewportHeight: 375, handleHeight: 53, ceiling: 260, halfFloor: 0 })).toEqual({ closed: 53, half: 115, full: 115 });
    expect(sheetSizes({ viewportHeight: 120, handleHeight: 53, ceiling: 100, halfFloor: 0 })).toEqual({ closed: 53, half: 53, full: 53 });
  });

  it('stops half below the map controls', () => {
    expect(sheetSizes({ viewportHeight: 375, handleHeight: 53, ceiling: 62, halfFloor: 257 })).toEqual({ closed: 53, half: 118, full: 313 });
    expect(sheetSizes({ viewportHeight: 375, handleHeight: 53, ceiling: 62, halfFloor: 360 })).toEqual({ closed: 53, half: 53, full: 313 });
  });

  it('rejects measures that are not lengths', () => {
    expect(() => sheetSizes({ viewportHeight: 0, handleHeight: 53, ceiling: 0, halfFloor: 0 })).toThrow(RangeError);
    expect(() => sheetSizes({ viewportHeight: 844, handleHeight: Number.NaN, ceiling: 159, halfFloor: 0 })).toThrow(RangeError);
    expect(() => sheetSizes({ viewportHeight: 844, handleHeight: 53, ceiling: -1, halfFloor: 0 })).toThrow(RangeError);
  });
});

describe('snapping a released drag', () => {
  it('rests at the nearest height after a slow release', () => {
    expect(snapAfterDrag(PHONE, 60, 0)).toBe('closed');
    expect(snapAfterDrag(PHONE, 210, 0.1)).toBe('closed');
    expect(snapAfterDrag(PHONE, 220, -0.1)).toBe('half');
    expect(snapAfterDrag(PHONE, 530, 0)).toBe('half');
    expect(snapAfterDrag(PHONE, 540, 0)).toBe('full');
  });

  it('moves on to the next height in the direction of a fling', () => {
    const fling = SHEET_SETTINGS.flingVelocity;
    expect(snapAfterDrag(PHONE, 70, fling)).toBe('half');
    expect(snapAfterDrag(PHONE, 380, fling)).toBe('full');
    expect(snapAfterDrag(PHONE, 670, -fling)).toBe('half');
    expect(snapAfterDrag(PHONE, 360, -fling)).toBe('closed');
  });

  it('stays at the end it is flung past', () => {
    expect(snapAfterDrag(PHONE, 685, 2)).toBe('full');
    expect(snapAfterDrag(PHONE, 53, -2)).toBe('closed');
  });

  it('rejects positions and speeds that are not numbers', () => {
    expect(() => snapAfterDrag(PHONE, Number.NaN, 0)).toThrow(RangeError);
    expect(() => snapAfterDrag(PHONE, 100, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('keeps a drag between closed and full', () => {
    expect(clampToSizes(PHONE, 10)).toBe(53);
    expect(clampToSizes(PHONE, 300)).toBe(300);
    expect(clampToSizes(PHONE, 900)).toBe(685);
  });
});

describe('release velocity', () => {
  it('measures the last moments of the drag only', () => {
    const samples = [
      { time: 0, visibleHeight: 53 },
      { time: 490, visibleHeight: 60 },
      { time: 520, visibleHeight: 80 },
      { time: 580, visibleHeight: 140 },
    ];
    expect(releaseVelocity(samples)).toBe(1);
  });

  it('is negative while the sheet shrinks and 0 for a pointer that rested or never moved', () => {
    expect(releaseVelocity([{ time: 0, visibleHeight: 400 }, { time: 40, visibleHeight: 360 }])).toBe(-1);
    expect(releaseVelocity([{ time: 0, visibleHeight: 300 }, { time: 400, visibleHeight: 360 }])).toBe(0);
    expect(releaseVelocity([{ time: 0, visibleHeight: 300 }])).toBe(0);
    expect(() => releaseVelocity([])).toThrow(RangeError);
  });
});

describe('handle button and keys', () => {
  it('toggles between closed and half, and closes from full', () => {
    expect(toggledHeight('closed')).toBe('half');
    expect(toggledHeight('half')).toBe('closed');
    expect(toggledHeight('full')).toBe('closed');
  });

  it('steps one height per arrow key and stops at the ends', () => {
    expect(steppedHeight('closed', 'up')).toBe('half');
    expect(steppedHeight('half', 'up')).toBe('full');
    expect(steppedHeight('full', 'up')).toBe('full');
    expect(steppedHeight('full', 'down')).toBe('half');
    expect(steppedHeight('closed', 'down')).toBe('closed');
  });
});

describe('sheet cover', () => {
  it('measures how far an element reaches under the sheet', () => {
    expect(sheetCover(53, 844, 640)).toBe(0);
    expect(sheetCover(380, 844, 640)).toBe(176);
    expect(sheetCover(380, 844, 464)).toBe(0);
  });
});
