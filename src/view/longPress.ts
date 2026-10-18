export const LONG_PRESS = {
  durationMs: 1000,
  /** A finger that moves further than this pans the map instead. */
  moveTolerancePx: 8,
} as const;

interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly startedAt: number;
}

export interface LongPressState {
  /** Touch and pen pointers that are down, so a second finger (a pinch) cancels the press. */
  readonly pointers: ReadonlySet<number>;
  readonly press: Press | null;
}

export type LongPressInput =
  | { readonly kind: 'down'; readonly pointerId: number; readonly pointerType: string; readonly x: number; readonly y: number; readonly time: number }
  | { readonly kind: 'move'; readonly pointerId: number; readonly x: number; readonly y: number }
  /** The pointer went up or the browser cancelled it. */
  | { readonly kind: 'up'; readonly pointerId: number }
  | { readonly kind: 'tick'; readonly time: number };

export interface LongPressStep {
  readonly state: LongPressState;
  /** Where the press that just completed started; null until one does. */
  readonly fired: { readonly x: number; readonly y: number } | null;
}

export const IDLE_PRESS: LongPressState = { pointers: new Set(), press: null };

/** One still touch or pen press held for the duration; mice open the menu with a right click instead. */
export function stepLongPress(state: LongPressState, input: LongPressInput): LongPressStep {
  switch (input.kind) {
    case 'down': {
      if (input.pointerType !== 'touch' && input.pointerType !== 'pen') return { state, fired: null };
      const pointers = new Set(state.pointers).add(input.pointerId);
      const press = state.pointers.size === 0 ? { pointerId: input.pointerId, x: input.x, y: input.y, startedAt: input.time } : null;
      return { state: { pointers, press }, fired: null };
    }
    case 'move': {
      const { press } = state;
      if (press === null || press.pointerId !== input.pointerId) return { state, fired: null };
      const moved = Math.hypot(input.x - press.x, input.y - press.y) > LONG_PRESS.moveTolerancePx;
      return { state: moved ? { ...state, press: null } : state, fired: null };
    }
    case 'up': {
      if (!state.pointers.has(input.pointerId)) return { state, fired: null };
      const pointers = new Set(state.pointers);
      pointers.delete(input.pointerId);
      return { state: { pointers, press: null }, fired: null };
    }
    case 'tick': {
      const { press } = state;
      if (press === null || input.time - press.startedAt < LONG_PRESS.durationMs) return { state, fired: null };
      return { state: { ...state, press: null }, fired: { x: press.x, y: press.y } };
    }
  }
}
