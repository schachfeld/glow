import { isLight } from "./model.mjs";

// A schedule turns lights on at the start of each time block and off at its
// end, every week. In Home Assistant it is a schedule helper, which holds the
// times, and an automation that switches the lights when the helper changes.
export const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const DAY = 1440;
const automationPrefix = "glow_schedule_";
export const scheduleAutomationId = (scheduleId) =>
  `${automationPrefix}${scheduleId}`;
export const isScheduleAutomation = (state) =>
  typeof state?.attributes?.id === "string" &&
  state.attributes.id.startsWith(automationPrefix);

// Minutes since midnight, from "07:30" or Home Assistant's "07:30:00". The end
// of a day is "24:00".
export function parseTime(value) {
  const match =
    typeof value === "string" && /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(value);
  if (!match) return NaN;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[2]) < 60 && minutes <= DAY ? minutes : NaN;
}
export const formatTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// Blocks of one day in order, with overlapping and touching blocks joined.
function mergeBlocks(blocks) {
  const merged = [];
  for (const block of [...blocks].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && block[0] <= last[1]) last[1] = Math.max(last[1], block[1]);
    else merged.push([...block]);
  }
  return merged;
}

// Checks a week of blocks and tidies it into the form Home Assistant accepts:
// every block within one day, none overlapping.
export function normalizeDays(days) {
  if (!days || typeof days !== "object" || Array.isArray(days))
    throw new Error("Add at least one time to the schedule.");
  const result = {};
  let count = 0;
  for (const day of weekdays) {
    const blocks = days[day] ?? [];
    if (!Array.isArray(blocks) || blocks.length > 48)
      throw new Error("Choose valid times for the schedule.");
    result[day] = mergeBlocks(
      blocks.map((block) => {
        const from = parseTime(block?.from);
        const to = parseTime(block?.to);
        if (!(from < to))
          throw new Error("Choose valid times for the schedule.");
        return [from, to];
      }),
    ).map(([from, to]) => ({ from: formatTime(from), to: formatTime(to) }));
    count += result[day].length;
  }
  if (!count) throw new Error("Add at least one time to the schedule.");
  return result;
}

// The editor works with slots: one on-time and off-time, repeated on chosen
// days. `start` and `end` are minutes since midnight. A slot whose end is not
// after its start runs into the next day, so 22:00 to 06:00 on Monday ends on
// Tuesday morning, and 00:00 to 00:00 is the whole day.
export function daysFromSlots(slots) {
  const blocks = Object.fromEntries(weekdays.map((day) => [day, []]));
  for (const { start, end, days } of slots)
    for (const day of days) {
      if (end > start) blocks[day].push([start, end]);
      else {
        blocks[day].push([start, DAY]);
        if (end > 0)
          blocks[weekdays[(weekdays.indexOf(day) + 1) % 7]].push([0, end]);
      }
    }
  return Object.fromEntries(
    weekdays.map((day) => [
      day,
      mergeBlocks(blocks[day]).map(([from, to]) => ({
        from: formatTime(from),
        to: formatTime(to),
      })),
    ]),
  );
}

export function slotsFromDays(days) {
  const blocks = weekdays.map((day) =>
    (days?.[day] ?? []).map((block) => ({
      start: parseTime(block.from),
      end: parseTime(block.to),
    })),
  );
  // A block that ends at midnight continues in the block that starts the next
  // day, when together they still read as one night.
  for (let index = 0; index < 7; index++)
    for (const block of blocks[index]) {
      if (block.end !== DAY) continue;
      const next = blocks[(index + 1) % 7];
      const morning = next.find(
        (other) =>
          other.start === 0 && !other.joined && other.end <= block.start,
      );
      if (!morning || morning === block) continue;
      morning.joined = true;
      block.end = morning.end;
    }
  const slots = [];
  blocks.forEach((dayBlocks, index) => {
    for (const block of dayBlocks) {
      if (block.joined) continue;
      const end = block.end % DAY;
      const slot = slots.find((s) => s.start === block.start && s.end === end);
      if (slot) slot.days.push(weekdays[index]);
      else slots.push({ start: block.start, end, days: [weekdays[index]] });
    }
  });
  return slots.sort((a, b) => a.start - b.start);
}

// What Glow asks for when a schedule is saved.
export function scheduleInput(body, home) {
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 60
  )
    throw new Error("Give your schedule a name of 1–60 characters.");
  const days = normalizeDays(body.days);
  if (body.roomId != null) {
    if (
      body.roomId === "unassigned" ||
      !home.rooms.some((room) => room.id === body.roomId)
    )
      throw new Error("Choose a room for this schedule.");
    return { name: body.name.trim(), days, roomId: body.roomId, lightIds: [] };
  }
  const known = new Set(
    [...home.lights, ...(home.groups ?? [])].map((light) => light.id),
  );
  if (
    !Array.isArray(body.lightIds) ||
    !body.lightIds.length ||
    body.lightIds.length > 500 ||
    body.lightIds.some((id) => !isLight(id) || !known.has(id))
  )
    throw new Error("Choose a room or at least one light for this schedule.");
  return {
    name: body.name.trim(),
    days,
    roomId: null,
    lightIds: [...new Set(body.lightIds)],
  };
}

// The week as the schedule helper stores it.
export const helperDays = (days) =>
  Object.fromEntries(
    weekdays.map((day) => [
      day,
      days[day].map(({ from, to }) => ({ from: `${from}:00`, to: `${to}:00` })),
    ]),
  );

// The automation that makes the lights follow the schedule helper. Its target
// is where Glow reads the schedule's room or lights back from.
export const scheduleAutomation = (schedule, scheduleId, entityId) => ({
  id: scheduleAutomationId(scheduleId),
  alias: schedule.name,
  description:
    "Made by Glow. Turns the lights on when the schedule starts and off when it ends. Edit it in Glow's Automations tab.",
  triggers: [{ trigger: "state", entity_id: entityId, to: ["on", "off"] }],
  actions: [
    {
      action: "light.turn_{{ trigger.to_state.state }}",
      target: schedule.roomId
        ? { area_id: [schedule.roomId] }
        : { entity_id: schedule.lightIds },
    },
  ],
  mode: "queued",
});

const list = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

// Glow's schedules, read from Home Assistant: every automation Glow made
// whose schedule helper still exists.
export function mapSchedules(helpers, automations, states, entities) {
  const helperEntities = new Map(
    entities
      .filter((entity) => entity.platform === "schedule")
      .map((entity) => [entity.unique_id, entity.entity_id]),
  );
  const automationStates = new Map(
    Object.values(states)
      .filter(isScheduleAutomation)
      .map((state) => [state.attributes.id, state]),
  );
  const schedules = [];
  for (const config of automations) {
    if (!config?.id?.startsWith(automationPrefix)) continue;
    const id = config.id.slice(automationPrefix.length);
    const helper = helpers.find((item) => item.id === id);
    if (!helper) continue;
    const entityId = helperEntities.get(id);
    const state = states[entityId];
    const target =
      list(config.actions ?? config.action)[0]?.target ??
      list(config.actions ?? config.action)[0]?.data ??
      {};
    const days = Object.fromEntries(
      weekdays.map((day) => [
        day,
        (helper[day] ?? [])
          .map((block) => [parseTime(block.from), parseTime(block.to)])
          .filter(([from, to]) => from < to)
          .map(([from, to]) => ({
            from: formatTime(from),
            to: formatTime(to),
          })),
      ]),
    );
    schedules.push({
      id,
      name: helper.name,
      entityId,
      enabled: automationStates.get(config.id)?.state !== "off",
      active: state?.state === "on",
      nextEvent: state?.attributes?.next_event ?? null,
      days,
      roomId: list(target.area_id)[0] ?? null,
      lightIds: list(target.entity_id).filter(isLight),
    });
  }
  return schedules.sort((a, b) => a.name.localeCompare(b.name));
}
