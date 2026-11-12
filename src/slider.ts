import { useEffect, useRef, useState } from "react";
import {
  createFollower,
  smoothingTime,
  type Smoothing,
} from "../packages/core/smoothing.mjs";

// Lights follow a slider while it moves. The thumb stays under the finger,
// and with smoothing on, the value sent to the lights eases after it. The
// caller coalesces commands, and releasing the slider reports whether the
// final value was accepted; a rejected value springs back to the light's real
// state. Shared by the add-on and the phone app.
export function useSliderDraft(
  value: number,
  onChange: (value: number) => void | Promise<boolean | void>,
  smoothing: Smoothing,
  step = 1,
) {
  const [draft, setDraft] = useState(value);
  const shown = useRef(value);
  const changing = useRef(false);
  const touches = useRef(0);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const sent = useRef<Promise<boolean | void>>(Promise.resolve());
  const follower = useRef<ReturnType<typeof createFollower> | null>(null);
  follower.current ??= createFollower((next) => {
    sent.current = Promise.resolve(latest.current.onChange(next));
  });
  useEffect(() => {
    if (!changing.current) {
      shown.current = value;
      setDraft(value);
    }
  }, [value]);
  // A slider that closes mid-move still leaves the light where it was let go.
  useEffect(() => () => follower.current?.flush(), []);

  const commit = async () => {
    if (!changing.current) return;
    const touch = touches.current;
    await follower.current!.settled();
    if (touch !== touches.current) return;
    changing.current = false;
    const accepted = await sent.current;
    if (accepted === false && touch === touches.current) {
      shown.current = latest.current.value;
      setDraft(latest.current.value);
    }
  };
  const change = (next: number) => {
    changing.current = true;
    touches.current += 1;
    const from = shown.current;
    shown.current = next;
    setDraft(next);
    follower.current!.to(next, { from, time: smoothingTime(smoothing), step });
  };
  return { draft, change, commit };
}
