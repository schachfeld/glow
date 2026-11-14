import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CalendarClock, ChevronRight, Plus } from "lucide-react-native";
import { plural, weekdays, type Home, type Schedule } from "../core";
import { useGlow } from "../glow";
import { useColors } from "../theme";
import { Page } from "../components/Overlays";
import { clock, dayNames, WeekPreview } from "../components/schedule";
import { Button, Card, Notice, Title, Toggle, Txt } from "../components/ui";
import { Loading } from "./RoomsScreen";
import { EmptyState, SectionHeading } from "./shared";

function targetName(schedule: Schedule, home: Home) {
  if (schedule.roomId)
    return (
      home.rooms.find((room) => room.id === schedule.roomId)?.name ??
      "A room that was removed"
    );
  if (schedule.lightIds.length !== 1)
    return plural(schedule.lightIds.length, "light");
  const id = schedule.lightIds[0];
  return (
    [...home.lights, ...(home.groups ?? [])].find((l) => l.id === id)?.name ??
    "1 light"
  );
}

// Home Assistant reports the next change in its own time zone, the one the
// schedule's times are in, so read the day and time as written.
function status(schedule: Schedule) {
  if (!schedule.enabled) return "Paused";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(
    schedule.nextEvent ?? "",
  );
  if (!match) return schedule.active ? "On now" : "";
  const [year, month, date, hour, minute] = match.slice(1).map(Number);
  const time = clock(hour * 60 + minute);
  if (schedule.active) return `On now, until ${time}`;
  const day =
    weekdays[(new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7];
  return `Turns on ${dayNames[day].short} at ${time}`;
}

function ScheduleCard({ schedule }: { schedule: Schedule }) {
  const colors = useColors();
  const glow = useGlow();
  // The switch moves at once; Home Assistant confirms a moment later.
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => setPending(null), [schedule.enabled]);
  const enabled = pending ?? schedule.enabled;
  const lit = enabled && schedule.active;
  const edit = () => glow.openScheduleEditor(schedule);
  const detail = [
    targetName(schedule, glow.home!),
    status({ ...schedule, enabled }),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${schedule.name}`}
          accessibilityHint={detail}
          onPress={edit}
          style={styles.title}
        >
          <View
            style={[styles.icon, { backgroundColor: colors.surfaceSunken }]}
          >
            <CalendarClock
              size={22}
              strokeWidth={1.6}
              color={lit ? colors.glowInk : colors.faint}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.name}>
              <Txt
                size={16}
                weight="semibold"
                numberOfLines={1}
                style={{ flexShrink: 1 }}
              >
                {schedule.name}
              </Txt>
              <ChevronRight size={15} color={colors.faint} />
            </View>
            <Txt size={13} tone="muted" numberOfLines={2}>
              {detail}
            </Txt>
          </View>
        </Pressable>
        <Toggle
          label={`${schedule.name} schedule`}
          on={enabled}
          disabled={glow.disabled}
          onChange={async () => {
            setPending(!enabled);
            const saved = await glow.action(
              `schedules/${encodeURIComponent(schedule.id)}/enabled`,
              { enabled: !enabled },
              "POST",
              undefined,
              false,
            );
            if (!saved) setPending(null);
          }}
        />
      </View>
      <Pressable accessible={false} onPress={edit}>
        <WeekPreview days={schedule.days} dimmed={!enabled} />
      </Pressable>
    </Card>
  );
}

export function AutomationsScreen() {
  const glow = useGlow();
  const home = glow.home;
  if (!home) return <Loading />;
  const schedules = home.schedules ?? [];
  const create = () => glow.openScheduleEditor();
  return (
    <Page>
      <Title>Automations</Title>
      <Txt size={14} tone="muted" style={styles.intro}>
        Let your lights look after themselves.
      </Txt>
      <SectionHeading title="Schedules" count={schedules.length || undefined}>
        {schedules.length > 0 && (
          <Button
            icon={Plus}
            label="New schedule"
            disabled={glow.disabled || !home.lights.length}
            onPress={create}
          />
        )}
      </SectionHeading>
      <View style={styles.grid}>
        {schedules.map((schedule) => (
          <View key={schedule.id} style={styles.cell}>
            <ScheduleCard schedule={schedule} />
          </View>
        ))}
      </View>
      {!schedules.length &&
        (home.lights.length ? (
          <EmptyState
            icon={CalendarClock}
            title="No schedules yet"
            text="A schedule turns a room or the lights you choose on and off at the same times every week."
            action="Create schedule"
            onAction={create}
          />
        ) : (
          <Notice>
            Schedules need lights. Yours appear in Rooms once Home Assistant has
            some.
          </Notice>
        ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: -12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  cell: { flexGrow: 1, flexBasis: 300 },
  card: { padding: 14, gap: 14 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  name: { flexDirection: "row", alignItems: "center", gap: 4 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
