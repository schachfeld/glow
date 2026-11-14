import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  Bookmark,
  Check,
  House,
  Layers,
  Lightbulb,
  Plus,
  Trash2,
} from "lucide-react-native";
import {
  daysFromSlots,
  roomLightLayout,
  slotsFromDays,
  weekdays,
  type Home,
  type Schedule,
  type ScheduleSlot,
  type Weekday,
} from "../core";
import { fonts, useColors } from "../theme";
import { Sheet } from "./Sheet";
import {
  dayNames,
  stepSlot,
  TimeRange,
  TimeStepper,
  WeekPreview,
} from "./schedule";
import { Button, Chip, FieldLabel, IconButton, Notice, Txt } from "./ui";

// An evening, every day: a sensible place to start from.
const firstSlot = (): ScheduleSlot => ({
  start: 18 * 60,
  end: 23 * 60,
  days: [...weekdays],
});

export function ScheduleEditor({
  home,
  schedule,
  onClose,
  onSave,
  onDelete,
  busy,
  errorMessage,
}: {
  home: Home;
  schedule?: Schedule;
  onClose: () => void;
  onSave: (data: object, id?: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  busy: boolean;
  errorMessage?: string;
}) {
  const colors = useColors();
  // Only Home Assistant Areas can be targeted as a whole room.
  const rooms = home.rooms.filter((room) => room.id !== "unassigned");
  const lightRooms = home.rooms
    .map((room) => ({ room, items: roomLightLayout(home, room.id).items }))
    .filter(({ items }) => items.length);
  const known = new Set(
    lightRooms.flatMap(({ items }) => items.map((l) => l.id)),
  );

  const [name, setName] = useState(schedule?.name ?? "");
  const [mode, setMode] = useState<"room" | "lights">(
    schedule ? (schedule.roomId ? "room" : "lights") : "room",
  );
  const [roomId, setRoomId] = useState<string | null>(
    schedule
      ? rooms.some((room) => room.id === schedule.roomId)
        ? schedule.roomId
        : null
      : (rooms[0]?.id ?? null),
  );
  const [lightIds, setLightIds] = useState<string[]>(
    schedule?.lightIds.filter((id) => known.has(id)) ?? [],
  );
  const [slots, setSlots] = useState<ScheduleSlot[]>(() =>
    schedule ? slotsFromDays(schedule.days) : [firstSlot()],
  );
  const [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
  const [error, setError] = useState("");

  const current = { name, mode, roomId, lightIds, slots };
  const [initial] = useState(() => JSON.stringify(current));
  const dirty = JSON.stringify(current) !== initial;
  const requestClose = () => (dirty ? setConfirm("discard") : onClose());

  const days = daysFromSlots(slots);
  const usesRoom = mode === "room" && rooms.length > 0;
  const missing = !name.trim()
    ? "Give the schedule a name."
    : usesRoom && !roomId
      ? "Choose a room."
      : !usesRoom && !lightIds.length
        ? "Choose at least one light."
        : slots.some((slot) => !slot.days.length)
          ? "Choose at least one day for each time."
          : !slots.length
            ? "Add at least one time."
            : "";

  const setSlot = (index: number, patch: Partial<ScheduleSlot>) =>
    setSlots((all) =>
      all.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  const toggleDay = (index: number, day: Weekday) => {
    const selected = slots[index].days;
    setSlot(index, {
      // Kept in week order, so the same choice always reads the same.
      days: weekdays.filter((d) => (d === day) !== selected.includes(d)),
    });
  };
  const toggleLight = (id: string) =>
    setLightIds((ids) =>
      ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id],
    );

  async function save() {
    setError("");
    if (missing) return setError(missing);
    const target = usesRoom ? { roomId } : { lightIds };
    if (await onSave({ name, days, ...target }, schedule?.id)) onClose();
    else setError("The schedule could not be saved. Please try again.");
  }
  async function remove() {
    if (schedule && (await onDelete(schedule.id))) onClose();
    else setError("The schedule could not be deleted. Please try again.");
  }

  const footer = confirm ? (
    <View style={styles.confirm} accessibilityRole="alert">
      <Txt size={14} style={{ lineHeight: 20 }}>
        {confirm === "delete"
          ? `Delete “${schedule?.name}”${home.mode === "live" ? " from Home Assistant" : ""}? This cannot be undone.`
          : "Discard your changes to this schedule?"}
      </Txt>
      <View style={styles.footerRow}>
        <Button
          kind="text"
          label={confirm === "delete" ? "Keep schedule" : "Keep editing"}
          onPress={() => setConfirm(null)}
        />
        <Button
          kind="danger"
          label={confirm === "delete" ? "Delete schedule" : "Discard changes"}
          disabled={busy}
          loading={busy && confirm === "delete"}
          onPress={confirm === "delete" ? remove : onClose}
        />
      </View>
    </View>
  ) : (
    // An error sits by the buttons, where it shows however far the sheet is
    // scrolled.
    <View style={styles.confirm}>
      {error ? <Notice kind="error">{errorMessage || error}</Notice> : null}
      <View style={styles.footerRow}>
        {schedule && (
          <IconButton
            icon={Trash2}
            label="Delete schedule"
            color={colors.dangerInk}
            disabled={busy}
            onPress={() => setConfirm("delete")}
            style={{ marginRight: "auto" }}
          />
        )}
        <Button label="Cancel" onPress={requestClose} />
        <Button
          kind="primary"
          icon={schedule ? Bookmark : Plus}
          label={busy ? "Saving…" : "Save schedule"}
          accessibilityLabel="Save schedule"
          disabled={busy}
          onPress={save}
        />
      </View>
    </View>
  );

  return (
    <Sheet
      title={schedule ? "Edit schedule" : "New schedule"}
      subtitle="Lights turn on when a time starts and off when it ends."
      onClose={requestClose}
      footer={footer}
    >
      <View style={{ gap: 8 }}>
        <FieldLabel>Schedule name</FieldLabel>
        <TextInput
          accessibilityLabel="Schedule name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Evening lights"
          placeholderTextColor={colors.faint}
          maxLength={60}
          returnKeyType="done"
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              fontFamily: fonts.regular,
            },
          ]}
        />
      </View>

      <FieldLabel style={styles.section}>Lights</FieldLabel>
      {rooms.length > 0 && (
        <View
          accessibilityLabel="What the schedule controls"
          style={styles.wrap}
        >
          <Chip
            label="A whole room"
            icon={House}
            selected={mode === "room"}
            onPress={() => setMode("room")}
          />
          <Chip
            label="Chosen lights"
            icon={Lightbulb}
            selected={mode === "lights"}
            onPress={() => setMode("lights")}
          />
        </View>
      )}
      {usesRoom ? (
        <>
          <View accessibilityLabel="Room" style={styles.wrap}>
            {rooms.map((room) => (
              <Chip
                key={room.id}
                label={room.name}
                selected={roomId === room.id}
                onPress={() => setRoomId(room.id)}
              />
            ))}
          </View>
          <Txt size={12} tone="muted" style={{ lineHeight: 17 }}>
            Every light in the room follows the schedule, including lights you
            add to it later.
          </Txt>
        </>
      ) : (
        lightRooms.map(({ room, items }) => (
          <View key={room.id} style={{ gap: 6 }}>
            <Txt size={13} weight="medium" tone="muted">
              {room.name}
            </Txt>
            {items.map((light) => {
              const selected = lightIds.includes(light.id);
              const Icon = "memberIds" in light ? Layers : Lightbulb;
              return (
                <Pressable
                  key={light.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={light.name}
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleLight(light.id)}
                  style={[
                    styles.light,
                    {
                      backgroundColor: selected
                        ? colors.selected
                        : colors.surface,
                      borderColor: selected
                        ? colors.borderSelected
                        : colors.border,
                    },
                  ]}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.8}
                    color={selected ? colors.selectedInk : colors.muted}
                  />
                  <Txt
                    size={15}
                    weight="medium"
                    numberOfLines={1}
                    style={{ flex: 1 }}
                    color={selected ? colors.selectedInk : undefined}
                  >
                    {light.name}
                  </Txt>
                  <View
                    style={[
                      styles.check,
                      {
                        borderColor: selected
                          ? colors.accent
                          : colors.toggleOffBorder,
                        backgroundColor: selected
                          ? colors.accent
                          : "transparent",
                      },
                    ]}
                  >
                    {selected && (
                      <Check
                        size={14}
                        strokeWidth={2.5}
                        color={colors.onAccent}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))
      )}

      <FieldLabel style={styles.section}>Your week</FieldLabel>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <WeekPreview days={days} />
      </View>

      <FieldLabel style={styles.section}>Times</FieldLabel>
      {slots.map((slot, index) => {
        const overnight = slot.end !== 0 && slot.end <= slot.start;
        return (
          <View
            key={index}
            accessibilityLabel={`Time ${index + 1}`}
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.steppers}>
              <TimeStepper
                lit
                label="Turns on"
                value={slot.start}
                onStep={(minutes) =>
                  setSlot(index, stepSlot(slot, "start", minutes))
                }
              />
              <TimeStepper
                lit={false}
                label="Turns off"
                note={overnight ? "next day" : undefined}
                value={slot.end}
                onStep={(minutes) =>
                  setSlot(index, stepSlot(slot, "end", minutes))
                }
              />
            </View>
            <TimeRange
              start={slot.start}
              end={slot.end}
              onChange={(start, end) => setSlot(index, { start, end })}
            />
            <View accessibilityLabel="Days" style={styles.days}>
              {weekdays.map((day) => {
                const selected = slot.days.includes(day);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="checkbox"
                    accessibilityLabel={dayNames[day].long}
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggleDay(index, day)}
                    hitSlop={{ top: 4, bottom: 4 }}
                    style={[
                      styles.day,
                      {
                        backgroundColor: selected
                          ? colors.selected
                          : "transparent",
                        borderColor: selected
                          ? colors.borderSelected
                          : colors.borderStrong,
                      },
                    ]}
                  >
                    <Txt
                      size={13}
                      weight="semibold"
                      color={selected ? colors.selectedInk : colors.muted}
                    >
                      {dayNames[day].short.slice(0, 2)}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            {slots.length > 1 && (
              <Button
                kind="plain"
                icon={Trash2}
                label="Remove this time"
                accessibilityLabel={`Remove time ${index + 1}`}
                onPress={() =>
                  setSlots((all) => all.filter((_, i) => i !== index))
                }
                style={{ alignSelf: "flex-end" }}
              />
            )}
          </View>
        );
      })}
      <Button
        icon={Plus}
        label="Add another time"
        onPress={() =>
          setSlots((all) => [
            ...all,
            { start: 7 * 60, end: 9 * 60, days: [...weekdays] },
          ])
        }
      />
      {home.mode === "live" && (
        <Notice>
          Saved to Home Assistant as a schedule helper and an automation, so it
          runs even when Glow is closed.
        </Notice>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  section: { marginTop: 6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  light: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  steppers: { flexDirection: "row", gap: 14 },
  days: { flexDirection: "row", gap: 6 },
  day: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  confirm: { flex: 1, gap: 10 },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
});
