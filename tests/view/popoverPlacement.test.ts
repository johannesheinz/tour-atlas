import { describe, expect, it } from 'vitest';
import { placeInViewport, type Box } from '../../src/view/popoverPlacement.ts';

const PHONE = { width: 375, height: 667 };
const LANDSCAPE = { width: 812, height: 375 };
const MARGIN = 8;

describe('placing a popover in the window', () => {
  it('keeps a panel that fits where its stylesheet put it', () => {
    const controls: Box = { left: 309, top: 128, width: 40, height: 190 };
    const menu: Box = { left: 49, top: 128, width: 250, height: 440 };
    expect(placeInViewport(menu, controls, PHONE, MARGIN)).toEqual({ left: 49, top: 128, maxHeight: null });
  });

  it('shifts a panel that runs past the bottom up, and shrinks it when the window is too short', () => {
    const controls: Box = { left: 746, top: 68, width: 40, height: 190 };
    expect(placeInViewport({ left: 486, top: 68, width: 250, height: 262 }, controls, LANDSCAPE, MARGIN)).toEqual({ left: 486, top: 68, maxHeight: null });
    expect(placeInViewport({ left: 486, top: 68, width: 250, height: 330 }, controls, LANDSCAPE, MARGIN)).toEqual({ left: 486, top: 37, maxHeight: null });
    expect(placeInViewport({ left: 486, top: 68, width: 250, height: 440 }, controls, LANDSCAPE, MARGIN)).toEqual({ left: 486, top: 8, maxHeight: 359 });
  });

  it('flips a panel above its button below it when there is no room above', () => {
    const anchor: Box = { left: 320, top: 40, width: 36, height: 36 };
    const panel: Box = { left: 0, top: 40 - 10 - 200, width: 356, height: 200 };
    expect(placeInViewport(panel, anchor, PHONE, MARGIN)).toEqual({ left: 8, top: 86, maxHeight: null });
  });

  it('flips a panel below its button above it when there is no room below', () => {
    const anchor: Box = { left: 300, top: 560, width: 36, height: 36 };
    const panel: Box = { left: 40, top: 606, width: 296, height: 150 };
    expect(placeInViewport(panel, anchor, PHONE, MARGIN)).toEqual({ left: 40, top: 400, maxHeight: null });
  });

  it('shifts instead when the other side has no room either', () => {
    const anchor: Box = { left: 300, top: 300, width: 36, height: 36 };
    const panel: Box = { left: 40, top: 346, width: 296, height: 400 };
    expect(placeInViewport(panel, anchor, PHONE, MARGIN)).toEqual({ left: 40, top: 259, maxHeight: null });
  });

  it('flips a menu left of its controls to their right when it would leave the window', () => {
    const controls: Box = { left: 60, top: 100, width: 40, height: 190 };
    expect(placeInViewport({ left: -200, top: 100, width: 250, height: 200 }, controls, PHONE, MARGIN)).toEqual({ left: 110, top: 100, maxHeight: null });
  });

  it('opens a menu at a spot below and right of it, or flips it away from the corner it would leave', () => {
    const spot = (left: number, top: number): Box => ({ left, top, width: 0, height: 0 });
    expect(placeInViewport({ ...spot(60, 200), width: 230, height: 90 }, spot(60, 200), PHONE, MARGIN)).toEqual({ left: 60, top: 200, maxHeight: null });
    expect(placeInViewport({ ...spot(300, 600), width: 230, height: 90 }, spot(300, 600), PHONE, MARGIN)).toEqual({ left: 70, top: 510, maxHeight: null });
  });

  it('shifts a panel overlapping its anchor inside the window', () => {
    const frame: Box = { left: 16, top: 118, width: 343, height: 400 };
    expect(placeInViewport({ left: 200, top: 300, width: 230, height: 90 }, frame, PHONE, MARGIN)).toEqual({ left: 137, top: 300, maxHeight: null });
  });

  it('rejects a window without room', () => {
    expect(() => placeInViewport({ left: 0, top: 0, width: 10, height: 10 }, { left: 0, top: 0, width: 0, height: 0 }, { width: 12, height: 400 }, MARGIN)).toThrow(RangeError);
    expect(() => placeInViewport({ left: Number.NaN, top: 0, width: 10, height: 10 }, { left: 0, top: 0, width: 0, height: 0 }, PHONE, MARGIN)).toThrow(RangeError);
  });
});
