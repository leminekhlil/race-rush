import { useRef, useSyncExternalStore } from 'react';

type Listener = () => void;

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: Listener): () => void;
}

/** Minimal observable store (no dependency), consumed in React via `useStore`. */
export const createStore = <T extends object>(initial: T): Store<T> => {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const shallowEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
};

/** Subscribes to a slice of a store. Selections are cached by state identity and shallow equality. */
export const useStore = <T extends object, S>(store: Store<T>, selector: (s: T) => S): S => {
  const cache = useRef<{ state: T; sel: S } | null>(null);
  const getSnapshot = () => {
    const state = store.get();
    const c = cache.current;
    if (c && c.state === state) return c.sel;
    const sel = selector(state);
    if (c && shallowEqual(c.sel, sel)) {
      cache.current = { state, sel: c.sel };
      return c.sel;
    }
    cache.current = { state, sel };
    return sel;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};
