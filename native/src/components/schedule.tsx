import { useRef } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import {
  GestureDetector,
  GestureStateManager,
  usePanGesture,
} from "react-native-gesture-handler";
import { Minus, Plus } from "lucide-react-native";
import { weekdays, type ScheduleDays, type Weekday } from "../core";
import { useColors } from "../theme";
import { useHold } from "./hold";
import { IconButton, Txt } from "./ui";

const DAY = 1440;
export const dayNames: Record<Weekday, { short: string; long: string }> = {
  monday: { short: "Mon", long: "Monday" },
  tuesday: { short: "Tue", long: "Tuesday" },
  wednesday: { short: "Wed", long: "Wednesday" },
  thursday: { short: "Thu", long: "Thursday" },
  friday: { short: "Fri", long: "Friday" },
  saturday: { short: "Sat", long: "Saturday" },
  sunday: { short: "Sun", long: "Sunday" },
};

// Times follow the phone's 12 or 24 hour setting.
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const hourFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
const at = (minutes: number) =>
  new Date(2024, 0, 1, Math.floor(minutes / 60) % 24, minutes % 60);
export const clock = (minutes: number) => timeFormat.format(at(minutes));
const minutesOf = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const clockTime = (time: string) => clock(minutesOf(time));

const today = () => weekdays[(new Date().getDay() + 6) % 7];
const axis = [0, 360, 720, 1080, DAY];

// The week at a glance: one line per day, lit where the lights are on.
export function WeekPreview({
  days,
  dimmed = false,
}: {
  days: ScheduleDays;
  dimmed?: boolean;
}) {
  const colors = useColors();
  const current = today();
  const summary = weekdays
    .filter((day) => days[day].length)
    .map(
      (day) =>
        `${dayNames[day].long}: ${days[day]
          .map((block) => `${clockTime(block.from)} to ${clockTime(block.to)}`)
          .join(", ")}`,
    )
    .join(". ");
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary ? `On times. ${summary}` : "No on times yet"}
      style={styles.week}
    >
      {weekdays.map((day) => (
        <View key={day} style={styles.weekRow}>
          <Txt
            size={12}
            weight={day === current ? "semibold" : "regular"}
            tone={day === current ? "text" : "muted"}
            style={styles.weekDay}
          >
            {dayNames[day].short}
          </Txt>
          <View
            style={[styles.weekTrack, { backgroundColor: colors.sliderTrack }]}
          >
            {days[day].map((block) => {
              const from = minutesOf(block.from);
              return (
                <View
                  key={block.from}
                  style={[
                    styles.weekBlock,
                    {
                      left: `${(from / DAY) * 100}%`,
                      width: `${((minutesOf(block.to) - from) / DAY) * 100}%`,
                      backgroundColor: colors.glowInk,
                      // A paused schedule fades its times, not its labels.
                      opacity: dimmed ? 0.4 : 1,
                    },
                  ]}
                />
              );
            })}
            {axis.slice(1, -1).map((minutes) => (
              <View
                key={minutes}
                style={[
                  styles.weekTick,
                  {
                    left: `${(minutes / DAY) * 100}%`,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.weekAxis}>
        {axis.map((minutes, index) => (
          <Txt
            key={minutes}
            size={12}
            tone="faint"
            style={[
              styles.axisLabel,
              index === 0
                ? { left: 0, textAlign: "left" }
                : index === axis.length - 1
                  ? { right: 0, textAlign: "right" }
                  : { left: `${(minutes / DAY) * 100}%`, marginLeft: -24 },
            ]}
          >
            {hourFormat.format(at(minutes))}
          </Txt>
        ))}
      </View>
    </View>
  );
}

// A slot's two times may not meet, except as 00:00 to 00:00, the whole day.
const allowed = (start: number, end: number) => start !== end || start === 0;

// One day as a track with an on-thumb and an off-thumb. Dragging moves the
// nearer thumb in quarter hours. The off-thumb may sit before the on-thumb:
// the lights then stay on past midnight.
export function TimeRange({
  start,
  end,
  onChange,
}: {
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const colors = useColors();
  const hold = useHold();
  const width = useRef(1);
  const latest = useRef({ start, end, onChange });
  latest.current = { start, end, onChange };
  const touch = useRef({ x: 0, moved: false, thumb: "start" });
  const endAt = end || DAY;
  const move = (x: number) => {
    const { start, end, onChange } = latest.current;
    const raw = (Math.min(width.current, Math.max(0, x)) / width.current) * DAY;
    const value = Math.round(raw / 15) * 15;
    const next =
      touch.current.thumb === "start"
        ? ([Math.min(DAY - 15, value), end] as const)
        : ([start, Math.max(15, value) % DAY] as const);
    if (allowed(...next) && (next[0] !== start || next[1] !== end))
      onChange(...next);
  };
  const pan = usePanGesture({
    manualActivation: true,
    onTouchesDown: ({ handlerTag }) => {
      hold(true);
      GestureStateManager.activate(handlerTag);
    },
    hitSlop: { left: 12, right: 12 },
    runOnJS: true,
    disableReanimated: true,
    onBegin: ({ x }) => {
      const { start, end } = latest.current;
      const position = (x / width.current) * DAY;
      touch.current = {
        x,
        moved: false,
        thumb:
          Math.abs(position - start) <= Math.abs(position - (end || DAY))
            ? "start"
            : "end",
      };
    },
    onUpdate: ({ x }) => {
      if (!touch.current.moved && Math.abs(x - touch.current.x) < 4) return;
      touch.current.moved = true;
      move(x);
    },
    onFinalize: ({ x, canceled }) => {
      hold(false);
      if (!touch.current.moved && !canceled) move(x);
    },
  });
  const overnight = end !== 0 && end <= start;
  const fills = overnight
    ? [
        [start, DAY],
        [0, end],
      ]
    : [[start, endAt]];
  return (
    <GestureDetector gesture={pan}>
      {/* Screen readers use the earlier and later buttons instead. */}
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.range}
        onLayout={(event: LayoutChangeEvent) => {
          width.current = Math.max(1, event.nativeEvent.layout.width);
        }}
      >
        <View
          pointerEvents="none"
          style={[styles.rangeLine, { backgroundColor: colors.sliderTrack }]}
        >
          {fills.map(([from, to]) => (
            <View
              key={from}
              style={[
                styles.rangeFill,
                {
                  left: `${(from / DAY) * 100}%`,
                  width: `${((to - from) / DAY) * 100}%`,
                  backgroundColor: colors.glowInk,
                },
              ]}
            />
          ))}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: `${(start / DAY) * 100}%`,
              backgroundColor: colors.glowInk,
              borderColor: colors.knob,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: `${(endAt / DAY) * 100}%`,
              backgroundColor: colors.knob,
              borderColor: colors.glowInk,
            },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

// One time with buttons that move it five minutes, for the exact minute the
// track is too coarse for.
export function TimeStepper({
  label,
  value,
  note,
  lit,
  onStep,
}: {
  label: string;
  value: number;
  note?: string;
  // Matches the thumb on the track: filled for on, hollow for off.
  lit: boolean;
  onStep: (minutes: number) => void;
}) {
  const colors = useColors();
  const time = clock(value);
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperLabel}>
        <View
          style={[
            styles.dot,
            {
              borderColor: colors.glowInk,
              backgroundColor: lit ? colors.glowInk : "transparent",
            },
          ]}
        />
        <Txt size={12} tone="muted" numberOfLines={1}>
          {note ? `${label} · ${note}` : label}
        </Txt>
      </View>
      <View style={styles.stepperRow}>
        <IconButton
          icon={Minus}
          size={18}
          label={`${label} 5 minutes earlier`}
          onPress={() => onStep(-5)}
          style={[styles.step, { borderColor: colors.borderStrong }]}
        />
        <Txt
          accessibilityLabel={`${label} at ${time}${note ? `, ${note}` : ""}`}
          accessibilityLiveRegion="polite"
          size={17}
          weight="semibold"
          style={styles.time}
        >
          {time}
        </Txt>
        <IconButton
          icon={Plus}
          size={18}
          label={`${label} 5 minutes later`}
          onPress={() => onStep(5)}
          style={[styles.step, { borderColor: colors.borderStrong }]}
        />
      </View>
    </View>
  );
}

// Moves one end of a slot, wrapping past midnight, unless the two would meet.
export function stepSlot(
  slot: { start: number; end: number },
  which: "start" | "end",
  minutes: number,
) {
  const value = (slot[which] + minutes + DAY) % DAY;
  const next = { ...slot, [which]: value };
  return allowed(next.start, next.end) ? next : slot;
}

const styles = StyleSheet.create({
  week: { gap: 5 },
  weekRow: { flexDirection: "row", alignItems: "center" },
  weekDay: { width: 38 },
  weekTrack: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  weekBlock: { position: "absolute", top: 0, bottom: 0, borderRadius: 5 },
  weekTick: { position: "absolute", top: 0, bottom: 0, width: 1, opacity: 0.6 },
  weekAxis: { marginLeft: 38, height: 18, marginTop: 1 },
  axisLabel: {
    position: "absolute",
    width: 48,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  range: { height: 48, justifyContent: "center", marginHorizontal: 11 },
  rangeLine: { height: 8, borderRadius: 4, overflow: "hidden" },
  rangeFill: { position: "absolute", top: 0, bottom: 0 },
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
  stepper: { flex: 1, gap: 6 },
  stepperLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1 },
  time: { flex: 1, textAlign: "center", fontVariant: ["tabular-nums"] },
});
