import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/view/fitMotion.ts';
import { applyMove, uncoverMove, type UncoverArea } from '../../src/view/uncover.ts';

const PHONE: UncoverArea = { width: 358, visibleHeight: 346, margin: 14 };
const BOTTOM = PHONE.visibleHeight - PHONE.margin;

describe('moving pins clear of the sheet', () => {
  it('leaves the map alone when no pin is under the sheet', () => {
    expect(uncoverMove([], PHONE)).toBeNull();
    expect(uncoverMove([[20, 40], [300, BOTTOM]], PHONE)).toBeNull();
  });

  it('pans up just far enough when the pins fit above the sheet', () => {
    const points: Point[] = [[40, 120], [200, 380], [330, 200]];
    const move = uncoverMove(points, PHONE);
    expect(move).toEqual({ scale: 1, dx: 0, dy: BOTTOM - 380 });
    if (move === null) throw new Error('expected a move');
    expect(points.map((point) => applyMove(move, point))).toEqual([[40, 120 + BOTTOM - 380], [200, BOTTOM], [330, 200 + BOTTOM - 380]]);
  });

  it('pans a pin tapped just above the closed sheet into view', () => {
    expect(uncoverMove([[180, 395]], PHONE)).toEqual({ scale: 1, dx: 0, dy: BOTTOM - 395 });
  });

  it('zooms out when the pins spread further than the room above the sheet', () => {
    const points: Point[] = [[30, 60], [350, 300], [100, 398]];
    const move = uncoverMove(points, PHONE);
    if (move === null) throw new Error('expected a move');
    expect(move.scale).toBeCloseTo((BOTTOM - PHONE.margin) / (398 - 60));
    const moved = points.map((point) => applyMove(move, point));
    const ys = moved.map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(PHONE.margin);
    expect(Math.max(...ys)).toBeCloseTo(BOTTOM);
    for (const [x] of moved) {
      expect(x).toBeGreaterThanOrEqual(30);
      expect(x).toBeLessThanOrEqual(350);
    }
  });

  it('keeps a pin near the top where it is instead of pushing it out', () => {
    const points: Point[] = [[100, 4], [200, 360]];
    const move = uncoverMove(points, PHONE);
    if (move === null) throw new Error('expected a move');
    expect(move.scale).toBeLessThan(1);
    const [first, second] = points.map((point) => applyMove(move, point));
    expect(first?.[1]).toBeCloseTo(4);
    expect(second?.[1]).toBeCloseTo(BOTTOM);
  });

  it('rejects an area with no room above the sheet', () => {
    expect(() => uncoverMove([[0, 0]], { width: 300, visibleHeight: 20, margin: 14 })).toThrow(RangeError);
    expect(() => uncoverMove([[0, 0]], { width: 300, visibleHeight: Number.NaN, margin: 14 })).toThrow(RangeError);
  });
});
