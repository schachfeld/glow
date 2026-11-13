import type { LightSettings } from "./types";
export const defaultTransition: number;
export const maxTransition: number;
export const transitionStep: number;
export function readTransition(value: unknown): number;
export function transitionText(seconds: number): string;
export function lightCommand(
  ids: string[],
  settings: Partial<LightSettings>,
  seconds: number,
): { ids: string[]; settings: Partial<LightSettings>; transition?: number };
