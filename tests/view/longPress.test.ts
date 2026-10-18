import { describe, expect, it } from 'vitest';
import { IDLE_PRESS, LONG_PRESS, stepLongPress, type LongPressInput, type LongPressState } from '../../src/view/longPress.ts';

/** Feeds the inputs in order and collects where presses fired. */
function run(inputs: readonly LongPressInput[], start: LongPressState = IDLE_PRESS) {
  let state = start;
  const fired: { x: number; y: number }[] = [];
  for (const input of inputs) {
    const step = stepLongPress(state, input);
    state = step.state;
    if (step.fired !== null) fired.push(step.fired);
  }
  return { state, fired };
}

const touchDown = (time: number, pointerId = 1, x = 100, y = 200): LongPressInput => ({ kind: 'down', pointerId, pointerType: 'touch', x, y, time });
const tick = (time: number): LongPressInput => ({ kind: 'tick', time });

describe('long press', () => {
  it('fires once at the start of a still press after a second, not before', () => {
    expect(LONG_PRESS.durationMs).toBe(1000);
    expect(run([touchDown(0), tick(999)]).fired).toEqual([]);
    const { fired, state } = run([touchDown(0), tick(1000), tick(2000)]);
    expect(fired).toEqual([{ x: 100, y: 200 }]);
    expect(state.press).toBeNull();
  });

  it('works for pens but leaves mice to the right click', () => {
    expect(run([{ kind: 'down', pointerId: 1, pointerType: 'pen', x: 5, y: 6, time: 0 }, tick(1000)]).fired).toEqual([{ x: 5, y: 6 }]);
    expect(run([{ kind: 'down', pointerId: 1, pointerType: 'mouse', x: 5, y: 6, time: 0 }, tick(1000)]).fired).toEqual([]);
  });

  it('tolerates a slight wobble but cancels once the finger moves further', () => {
    const tolerance = LONG_PRESS.moveTolerancePx;
    expect(run([touchDown(0), { kind: 'move', pointerId: 1, x: 100 + tolerance, y: 200 }, tick(1000)]).fired).toHaveLength(1);
    expect(run([touchDown(0), { kind: 'move', pointerId: 1, x: 100 + tolerance, y: 201 }, tick(1000)]).fired).toEqual([]);
    expect(run([touchDown(0), { kind: 'move', pointerId: 1, x: 130, y: 200 }, { kind: 'move', pointerId: 1, x: 100, y: 200 }, tick(1000)]).fired).toEqual([]);
  });

  it('cancels when the press ends or the browser cancels it early', () => {
    expect(run([touchDown(0), { kind: 'up', pointerId: 1 }, tick(1000)]).fired).toEqual([]);
    const { state } = run([touchDown(0), { kind: 'up', pointerId: 1 }]);
    expect(state.pointers.size).toBe(0);
  });

  it('cancels for a second finger, and a pinch never turns into a press', () => {
    expect(run([touchDown(0), touchDown(100, 2, 300, 300), tick(1000)]).fired).toEqual([]);
    expect(run([touchDown(0), touchDown(100, 2), { kind: 'up', pointerId: 2 }, tick(1500)]).fired).toEqual([]);
    expect(run([touchDown(0), touchDown(100, 2), { kind: 'up', pointerId: 1 }, tick(1500)]).fired).toEqual([]);
  });

  it('starts afresh after every finger is up', () => {
    const pinch = run([touchDown(0), touchDown(100, 2), { kind: 'up', pointerId: 1 }, { kind: 'up', pointerId: 2 }]);
    expect(run([touchDown(5000, 3, 10, 20), tick(6000)], pinch.state).fired).toEqual([{ x: 10, y: 20 }]);
  });

  it('ignores moves of other pointers', () => {
    expect(run([touchDown(0), { kind: 'move', pointerId: 7, x: 900, y: 900 }, tick(1000)]).fired).toHaveLength(1);
  });
});
