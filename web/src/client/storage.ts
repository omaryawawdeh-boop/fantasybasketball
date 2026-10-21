"use client";

import { useSyncExternalStore } from "react";

// A tiny persisted store on top of localStorage. Every read/write is wrapped: private windows,
// disabled storage or quota errors degrade to in-memory state instead of crashing.

type Listener = () => void;

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(l: Listener): () => void;
  /** False if the browser refused storage; the UI can warn that changes won't persist. */
  persistent(): boolean;
}

const stores = new Map<string, Store<unknown>>();

export function createStore<T>(key: string, initial: T, migrate?: (raw: unknown) => T): Store<T> {
  const existing = stores.get(key);
  if (existing) return existing as Store<T>;
  let value: T = initial;
  let loaded = false;
  let canPersist = true;
  const listeners = new Set<Listener>();

  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        value = migrate ? migrate(parsed) : ({ ...initial, ...parsed } as T);
      }
    } catch {
      canPersist = false;
    }
  };

  const store: Store<T> = {
    get() {
      load();
      return value;
    },
    set(next) {
      load();
      value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        canPersist = false;
      }
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => {
        if (e.key !== key) return;
        loaded = false;
        load();
        l();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(l);
        window.removeEventListener("storage", onStorage);
      };
    },
    persistent() {
      load();
      return canPersist;
    },
  };
  stores.set(key, store as Store<unknown>);
  return store;
}

/** Subscribe a component to a store. Server render uses the initial value. */
export function useStore<T>(store: Store<T>, serverValue: T): T {
  return useSyncExternalStore(store.subscribe, store.get, () => serverValue);
}
