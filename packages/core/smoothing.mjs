// Slider smoothing. The thumb stays under the finger, but the value sent to
// the lights eases toward it, so a fast drag or a tap far along the track
// fades the light there instead of jumping.

export const smoothingDefaults = { enabled: true, amount: 30 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeSmoothing(value) {
  const amount = Number(value?.amount);
  return {
    enabled:
      typeof value?.enabled === "boolean"
        ? value.enabled
        : smoothingDefaults.enabled,
    amount: Number.isFinite(amount)
      ? Math.round(clamp(amount, 0, 100))
      : smoothingDefaults.amount,
  };
}

// The amount (0 to 100) as a time constant in milliseconds. The light covers
// about 95% of the way to the thumb in three time constants.
export function smoothingTime({ enabled, amount }) {
  return enabled ? 15 + clamp(amount, 0, 100) * 3.35 : 0;
}

// How long the light takes to catch up, in seconds, for showing the setting.
export function smoothingSeconds(smoothing) {
  return Math.round((smoothingTime(smoothing) * 3) / 50) / 20;
}

const frame =
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (run) => setTimeout(() => run(Date.now()), 16);
const cancelFrame =
  typeof cancelAnimationFrame === "function"
    ? cancelAnimationFrame
    : clearTimeout;
const now = () =>
  typeof performance === "object" ? performance.now() : Date.now();

// Follows a target with frame-rate independent exponential smoothing (a lerp
// toward the target on every frame) and emits each new value, rounded to the
// slider's step. The last value emitted is always the target itself.
export function createFollower(emit, options = {}) {
  const schedule = options.frame ?? frame;
  const cancel = options.cancel ?? cancelFrame;
  const clock = options.now ?? now;
  let current = null;
  let target = null;
  let emitted = null;
  let tau = 0;
  let step = 1;
  let last = 0;
  let handle = null;
  let waiters = [];

  const send = (value) => {
    if (value === emitted) return;
    emitted = value;
    emit(value);
  };
  const finish = () => {
    if (handle !== null) cancel(handle);
    handle = null;
    current = target;
    send(target);
    const done = waiters;
    waiters = [];
    for (const resolve of done) resolve();
  };
  const tick = () => {
    handle = null;
    const time = clock();
    const elapsed = Math.max(0, time - last);
    last = time;
    current += (target - current) * (1 - Math.exp(-elapsed / tau));
    if (Math.abs(target - current) < step / 2) return finish();
    send(Math.round(current / step) * step);
    handle = schedule(tick);
  };

  return {
    // Moves toward a value. `from` is where to start when not already moving.
    to(value, { from, time, step: size = 1 }) {
      target = value;
      tau = time;
      step = size;
      if (handle === null) {
        current = from ?? value;
        // Starting where the light already is sends nothing until it moves,
        // but a slider set to its own value still sends that value.
        emitted = from === value ? null : (from ?? null);
      }
      if (tau <= 0 || current === target) return finish();
      if (handle === null) {
        last = clock();
        handle = schedule(tick);
      }
    },
    get moving() {
      return handle !== null;
    },
    // Resolves once the light has reached the target.
    settled() {
      return handle === null
        ? Promise.resolve()
        : new Promise((resolve) => waiters.push(resolve));
    },
    // Jumps to the target now, for a slider that goes away mid-move.
    flush() {
      if (handle !== null) finish();
    },
  };
}
