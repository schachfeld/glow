// Slider smoothing. While a slider is held, the thumb stays under the finger
// and the value sent to the lights glides after it. Every move of the thumb
// retargets the glide at once, and letting go ends it: the lights go straight
// to where the thumb was released.

export const smoothingDefaults = { enabled: true, amount: 50 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, share) => from + (to - from) * share;

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

// How long the lights take to catch up with a thumb that crossed the whole
// track at once, in seconds: from a glide you can barely see to a slow fade.
// Each step along the setting lengthens the glide by the same share, so the
// short glides get as much room on it as the long ones. Shorter moves catch up
// sooner.
const quickest = 0.1;
const smoothest = 3;
const catchUp = (amount) =>
  quickest * (smoothest / quickest) ** (clamp(amount, 0, 100) / 100);

// The same, rounded for showing the setting.
export function smoothingSeconds({ amount }) {
  return Math.round(catchUp(amount) * 10) / 10;
}

// The glide as a time constant in milliseconds, or 0 for no smoothing. On each
// frame the light covers a share of the way left to the slider:
// light += (slider - light) * (1 - exp(-elapsed / time)). A glide ends within
// half a step of the target, which on a track of 100 steps takes ln(200) time
// constants.
export function smoothingTime({ enabled, amount }) {
  return enabled ? (catchUp(amount) * 1000) / Math.log(200) : 0;
}

const frame =
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (run) => setTimeout(run, 16);
const cancelFrame =
  typeof cancelAnimationFrame === "function"
    ? cancelAnimationFrame
    : clearTimeout;
const now = () =>
  typeof performance === "object" ? performance.now() : Date.now();

// Follows a target by lerping toward it on every frame, by a share that
// depends on the time since the last frame, so the glide is the same at any
// frame rate. It emits each new value, rounded to the slider's step.
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
  };
  const tick = () => {
    handle = null;
    const time = clock();
    const elapsed = Math.max(0, time - last);
    last = time;
    current = lerp(current, target, 1 - Math.exp(-elapsed / tau));
    if (Math.abs(target - current) < step / 2) return finish();
    send(Math.round(current / step) * step);
    handle = schedule(tick);
  };

  return {
    // Heads for a value, from wherever the glide is now. `from` is where the
    // lights are when no glide is running.
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
    // Ends the glide: the lights go to the target now. Used when the slider
    // is let go, and when it goes away mid-move.
    flush() {
      if (handle !== null) finish();
    },
  };
}
