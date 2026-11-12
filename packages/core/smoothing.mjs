// Slider smoothing. While a slider is held, the thumb stays under the finger
// and the value sent to the lights glides after it. Every move of the thumb
// retargets the glide at once, and letting go ends it: the lights go straight
// to where the thumb was released.

export const smoothingDefaults = { enabled: true, amount: 25 };

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

// The share of the remaining distance the light covers on each frame, at 60
// frames a second: light += (slider - light) * factor. The default amount
// gives 0.8, the quick end 1 (no glide) and the smooth end 0.2.
export function smoothingFactor({ enabled, amount }) {
  return enabled ? 1 - clamp(amount, 0, 100) / 125 : 1;
}

const frameMs = 1000 / 60;

// The same factor as a time constant in milliseconds, so the glide looks the
// same when frames are shorter or longer than at 60 a second. 0 means no
// smoothing.
export function smoothingTime(smoothing) {
  const factor = smoothingFactor(smoothing);
  return factor >= 1 ? 0 : frameMs / -Math.log(1 - factor);
}

// How long the lights take to catch up with a thumb that crossed the whole
// track at once, in seconds, for showing the setting. A glide ends within
// half a step of the target, which on a track of 100 steps takes ln(200) time
// constants. Shorter moves catch up sooner.
export function smoothingSeconds({ amount }) {
  const time = smoothingTime({ enabled: true, amount });
  return Math.round((time * Math.log(200)) / 10) / 100;
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
