export type Smoothing = { enabled: boolean; amount: number };
export const smoothingDefaults: Smoothing;
export function normalizeSmoothing(value: unknown): Smoothing;
export function smoothingTime(smoothing: Smoothing): number;
export function smoothingSeconds(smoothing: Smoothing): number;
export type Follower = {
  to(
    value: number,
    options: { from?: number; time: number; step?: number },
  ): void;
  readonly moving: boolean;
  settled(): Promise<void>;
  flush(): void;
};
export function createFollower(
  emit: (value: number) => void,
  options?: {
    frame?: (run: () => void) => unknown;
    cancel?: (handle: any) => void;
    now?: () => number;
  },
): Follower;
