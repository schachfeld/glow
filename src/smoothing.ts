import { useSyncExternalStore } from "react";
import {
  normalizeSmoothing,
  smoothingDefaults,
  type Smoothing,
} from "../packages/core/smoothing.mjs";

const key = "glow-slider-smoothing";
const listeners = new Set<() => void>();

function load(): Smoothing {
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeSmoothing(JSON.parse(raw)) : smoothingDefaults;
  } catch {
    return smoothingDefaults;
  }
}
let current = load();

// How much sliders smooth light changes is a preference of this browser,
// like the theme, and every slider follows a change at once.
export function setSmoothing(next: Smoothing) {
  current = normalizeSmoothing(next);
  try {
    localStorage.setItem(key, JSON.stringify(current));
  } catch {
    // Without storage, the choice still lasts until the page reloads.
  }
  for (const listener of listeners) listener();
}

export function useSmoothing() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
