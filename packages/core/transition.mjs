// A short fade on every slider command, so lights glide between the values a
// drag sends instead of stepping. Seconds; 0 leaves the fade to each light.
export const defaultTransition = 0.3;
export const maxTransition = 2;
export const transitionStep = 0.1;

export function readTransition(value) {
  const seconds = Number(value);
  if (value === null || value === "" || !Number.isFinite(seconds))
    return defaultTransition;
  return Math.min(maxTransition, Math.max(0, Math.round(seconds * 10) / 10));
}

export const transitionText = (seconds) =>
  seconds > 0 ? `${seconds.toFixed(1)} s` : "Off";

// The body of a light command. Only changes of brightness, white or color
// fade; switching a light on or off stays as quick as the light makes it.
export function lightCommand(ids, settings, seconds) {
  const fades =
    seconds > 0 &&
    settings.on !== false &&
    (settings.brightness !== undefined ||
      settings.kelvin !== undefined ||
      settings.color !== undefined);
  return { ids, settings, ...(fades ? { transition: seconds } : {}) };
}
