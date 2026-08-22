"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Read a boolean flag from localStorage without an effect.
 *
 * `useSyncExternalStore` is the sanctioned way to subscribe to state that lives
 * outside React: it gives a stable server snapshot (so SSR and the first client
 * render agree) and re-renders when the value changes, including from another tab.
 */
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePersistentFlag(
  key: string,
  serverDefault = false,
): readonly [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key) === "1",
    () => serverDefault,
  );

  const toggle = useCallback(() => {
    window.localStorage.setItem(key, window.localStorage.getItem(key) === "1" ? "0" : "1");
    notify();
  }, [key]);

  return [value, toggle] as const;
}
