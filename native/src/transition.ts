import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultTransition, readTransition } from "./core";

const key = "glow-transition";
const listeners = new Set<() => void>();

// How long lights fade to a slider value, in seconds. Like the theme, it is a
// preference of this device, not of the home.
let seconds = defaultTransition;
let chosen = false;

const set = (next: number) => {
  seconds = next;
  for (const listener of listeners) listener();
};

AsyncStorage.getItem(key)
  .then((value) => {
    if (!chosen) set(readTransition(value));
  })
  .catch(() => {});

export const lightTransition = () => seconds;

export function setLightTransition(next: number) {
  chosen = true;
  set(readTransition(next));
  AsyncStorage.setItem(key, String(seconds)).catch(() => {
    // Without storage, the choice still lasts until Glow restarts.
  });
}

export const useLightTransition = () =>
  useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, lightTransition);
