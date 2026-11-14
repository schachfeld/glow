import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from "react-native";
import {
  GestureDetector,
  GestureStateManager,
  usePanGesture,
} from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { Sun, Thermometer, Timer } from "lucide-react-native";
import {
  maxTransition,
  transitionStep,
  transitionText,
  whiteToHex,
} from "../core";
import { useColors } from "../theme";
import { useHold } from "./hold";
import { Txt } from "./ui";

// Lights follow a slider while it moves. The caller coalesces commands, and
// releasing it reports whether the final value was accepted; a rejected value
// springs back to the light's real state.
function useSliderDraft(
  value: number,
  onChange: (value: number) => void | Promise<boolean | void>,
) {
  const [draft, setDraft] = useState(value);
  const changing = useRef(false);
  const latest = useRef(value);
  const sent = useRef<Promise<boolean | void>>(Promise.resolve());
  latest.current = value;
  useEffect(() => {
    if (!changing.current) setDraft(value);
  }, [value]);
  const commit = async () => {
    if (changing.current) {
      changing.current = false;
      const accepted = await sent.current;
      if (accepted === false && !changing.current) setDraft(latest.current);
    }
  };
  const change = (next: number) => {
    changing.current = true;
    setDraft(next);
    sent.current = Promise.resolve(onChange(next));
  };
  return { draft, change, commit };
}

// A horizontal track. It claims the touch as soon as a finger lands and holds
// the page still until it lifts, so moving the finger up or down while dragging
// neither scrolls the page nor swipes back. A tap jumps to that spot.
function Track({
  value,
  min,
  max,
  step,
  nudge = step * (step === 1 ? 5 : 2),
  disabled,
  label,
  valueText,
  onMove,
  onRelease,
  onTap,
  track,
  thumbColor,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  // How far one accessibility increment or decrement moves the value.
  nudge?: number;
  disabled: boolean;
  label: string;
  valueText: string;
  onMove: (value: number) => void;
  onRelease: () => void;
  onTap?: () => void;
  track: (fraction: number) => ReactNode;
  thumbColor?: string;
}) {
  const colors = useColors();
  const hold = useHold();
  const width = useRef(1);
  const start = useRef({ x: 0, moved: false });
  const range = Math.max(1, max - min);
  const fraction = Math.min(1, Math.max(0, (value - min) / range));
  const at = (x: number) => {
    const raw =
      min + (Math.min(width.current, Math.max(0, x)) / width.current) * range;
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  };
  const keyboard = (event: AccessibilityActionEvent) => {
    const delta = event.nativeEvent.actionName === "increment" ? nudge : -nudge;
    onMove(Math.min(max, Math.max(min, value + delta)));
    onRelease();
  };
  const pan = usePanGesture({
    manualActivation: true,
    enabled: !disabled,
    onTouchesDown: ({ handlerTag }) => {
      hold(true);
      GestureStateManager.activate(handlerTag);
    },
    hitSlop: trackSlop,
    runOnJS: true,
    disableReanimated: true,
    onBegin: ({ x }) => {
      start.current = { x, moved: false };
    },
    onUpdate: ({ x }) => {
      if (!start.current.moved && Math.abs(x - start.current.x) < 4) return;
      start.current.moved = true;
      onMove(at(x));
    },
    onFinalize: ({ x, canceled }) => {
      hold(false);
      if (!start.current.moved) {
        if (canceled) return;
        onMove(at(x));
        onTap?.();
      }
      onRelease();
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        accessibilityValue={{ min, max, now: value, text: valueText }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={disabled ? undefined : keyboard}
        style={styles.track}
        onLayout={(event: LayoutChangeEvent) => {
          width.current = Math.max(1, event.nativeEvent.layout.width);
        }}
      >
        <View pointerEvents="none" style={styles.trackLine}>
          {track(fraction)}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: `${fraction * 100}%`,
              backgroundColor: thumbColor ?? colors.knob,
              borderColor: colors.thumbBorder,
            },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

export function Brightness({
  value,
  onChange,
  disabled = false,
  label = "Brightness",
  compact = false,
}: {
  value: number;
  onChange: (value: number) => void | Promise<boolean | void>;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}) {
  const colors = useColors();
  const { draft, change, commit } = useSliderDraft(value, onChange);
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Sun size={compact ? 17 : 20} color={colors.faint} strokeWidth={1.6} />
      <Track
        value={draft}
        min={value === 0 ? 0 : 1}
        max={100}
        step={1}
        disabled={disabled}
        label={label}
        valueText={`${draft}%`}
        onMove={(next) => change(Math.max(1, next))}
        onRelease={commit}
        track={(fraction) => (
          <>
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.sliderTrack },
              ]}
            />
            <View
              style={{
                width: `${fraction * 100}%`,
                height: "100%",
                backgroundColor: colors.sliderFill,
              }}
            />
          </>
        )}
      />
      <Txt
        size={compact ? 12 : 14}
        tone="textSecondary"
        style={[styles.value, { fontVariant: ["tabular-nums"] }]}
      >
        {draft}%
      </Txt>
    </View>
  );
}

// White light from warm to cool, on a track painted with those whites.
export function WhiteSlider({
  value,
  min,
  max,
  onChange,
  disabled = false,
  inactive = false,
  label = "White temperature",
  compact = false,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (kelvin: number) => void | Promise<boolean | void>;
  disabled?: boolean;
  // The light shows a color, so no white is selected.
  inactive?: boolean;
  label?: string;
  compact?: boolean;
}) {
  const colors = useColors();
  const { draft, change, commit } = useSliderDraft(value, onChange);
  const stops = Array.from({ length: 5 }, (_, i) =>
    whiteToHex(min + ((max - min) * i) / 4),
  ) as [string, string, ...string[]];
  const locked = disabled || max <= min;
  return (
    <View style={[styles.row, locked && styles.disabled]}>
      <Thermometer
        size={compact ? 17 : 20}
        color={colors.faint}
        strokeWidth={1.6}
      />
      <Track
        value={draft}
        min={min}
        max={max}
        step={50}
        disabled={locked}
        label={label}
        valueText={inactive ? "Showing a color" : `${draft} K`}
        onMove={change}
        onRelease={commit}
        // While the light shows a color, tapping where the slider already
        // is still means "this white".
        onTap={() => {
          if (inactive) onChange(draft);
        }}
        thumbColor={inactive ? colors.knob : whiteToHex(draft)}
        track={() => (
          <LinearGradient
            colors={stops}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, inactive && { opacity: 0.55 }]}
          />
        )}
      />
      <Txt
        size={compact ? 12 : 14}
        tone="textSecondary"
        style={[styles.value, styles.kelvin]}
      >
        {draft} K
      </Txt>
    </View>
  );
}

// How long lights fade to a slider value, in seconds. The track counts steps,
// so every stop is a whole number.
export function TransitionSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (seconds: number) => void;
}) {
  const colors = useColors();
  const steps = Math.round(maxTransition / transitionStep);
  return (
    <View style={styles.row}>
      <Timer size={20} color={colors.faint} strokeWidth={1.6} />
      <Track
        value={Math.round(value / transitionStep)}
        min={0}
        max={steps}
        step={1}
        nudge={1}
        disabled={false}
        label="Fade time"
        valueText={transitionText(value)}
        onMove={(next) => onChange(next * transitionStep)}
        onRelease={() => {}}
        track={(fraction) => (
          <>
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.sliderTrack },
              ]}
            />
            <View
              style={{
                width: `${fraction * 100}%`,
                height: "100%",
                backgroundColor: colors.sliderFill,
              }}
            />
          </>
        )}
      />
      <Txt size={14} tone="textSecondary" style={styles.value}>
        {transitionText(value)}
      </Txt>
    </View>
  );
}

// Touches may start a little past either end of the track, in the gap beside
// the icon and the value, so a thumb at 0% or 100% can be grabbed whole.
const trackSlop = { left: 12, right: 12 };

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  disabled: { opacity: 0.45 },
  // At least 44pt (iOS) and 48dp (Android) tall, so it is easy to touch.
  track: {
    flex: 1,
    height: 48,
    justifyContent: "center",
  },
  trackLine: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    flexDirection: "row",
  },
  thumb: {
    position: "absolute",
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    borderWidth: 2.5,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  value: {
    minWidth: 42,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  kelvin: { minWidth: 60 },
});
