import { useSyncExternalStore } from "react";
import { readTransition } from "../packages/core/transition.mjs";

const key = "glow-transition";
const listeners = new Set<() => void>();

function saved() {
  try {
    return readTransition(localStorage.getItem(key));
  } catch {
    return readTransition(null);
  }
}

// How long lights fade to a slider value, in seconds. Like the theme, it is a
// preference of this device and lives in the browser.
let seconds = saved();

export const lightTransition = () => seconds;

export function setLightTransition(next: number) {
  seconds = readTransition(next);
  try {
    localStorage.setItem(key, String(seconds));
  } catch {
    // Without storage, the choice still lasts until the page reloads.
  }
  for (const listener of listeners) listener();
}

export const useLightTransition = () =>
  useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, lightTransition);
