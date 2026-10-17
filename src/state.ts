export type Listener<T> = (state: T, previous: T) => void;

export interface Store<T> {
  get(): T;
  set(update: Partial<T> | ((current: T) => Partial<T>)): void;
  subscribe(listener: Listener<T>): () => void;
}

/** Minimal observable state: shallow-merged updates, listeners get the new and previous state. */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => state,
    set(update) {
      const patch = typeof update === 'function' ? update(state) : update;
      const changed = Object.entries(patch).some(([key, value]) => !Object.is(state[key as keyof T], value));
      if (!changed) return;
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
