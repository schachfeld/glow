import test from "node:test";
import assert from "node:assert/strict";
import {
  daysFromSlots,
  mapSchedules,
  normalizeDays,
  scheduleAutomation,
  slotsFromDays,
  weekdays,
} from "../packages/core/schedules.mjs";
import { createCore } from "../packages/core/controller.mjs";
import { createDemo } from "../packages/core/model.mjs";

const week = (days) =>
  Object.fromEntries(weekdays.map((day) => [day, days[day] ?? []]));

test("a slot past midnight is split over two days and read back as one", () => {
  const slots = [
    { start: 22 * 60, end: 6 * 60, days: ["monday", "sunday"] },
    { start: 7 * 60, end: 9 * 60, days: ["monday", "tuesday"] },
  ];
  const days = daysFromSlots(slots);
  assert.deepEqual(
    days,
    week({
      // Sunday night ends on Monday morning.
      monday: [
        { from: "00:00", to: "06:00" },
        { from: "07:00", to: "09:00" },
        { from: "22:00", to: "24:00" },
      ],
      tuesday: [
        { from: "00:00", to: "06:00" },
        { from: "07:00", to: "09:00" },
      ],
      sunday: [{ from: "22:00", to: "24:00" }],
    }),
  );
  assert.deepEqual(slotsFromDays(days), [
    { start: 7 * 60, end: 9 * 60, days: ["monday", "tuesday"] },
    { start: 22 * 60, end: 6 * 60, days: ["monday", "sunday"] },
  ]);
});

test("overlapping times are joined, and a whole day stays a whole day", () => {
  assert.deepEqual(
    daysFromSlots([
      { start: 60, end: 180, days: ["friday"] },
      { start: 120, end: 240, days: ["friday"] },
      { start: 0, end: 0, days: ["saturday"] },
    ]),
    week({
      friday: [{ from: "01:00", to: "04:00" }],
      saturday: [{ from: "00:00", to: "24:00" }],
    }),
  );
  assert.deepEqual(
    slotsFromDays(week({ saturday: [{ from: "00:00", to: "24:00" }] })),
    [{ start: 0, end: 0, days: ["saturday"] }],
  );
  assert.deepEqual(
    normalizeDays({
      monday: [
        { from: "10:00", to: "12:00" },
        { from: "08:00", to: "10:00" },
      ],
    }).monday,
    [{ from: "08:00", to: "12:00" }],
  );
  assert.throws(() => normalizeDays({}), /at least one time/);
  assert.throws(
    () => normalizeDays({ monday: [{ from: "10:00", to: "09:00" }] }),
    /valid times/,
  );
});

test("schedules are read from the helper and the automation Glow made", () => {
  const automation = scheduleAutomation(
    { name: "Evening", roomId: "living_room", lightIds: [] },
    "evening",
    "schedule.evening",
  );
  const schedules = mapSchedules(
    [
      {
        id: "evening",
        name: "Evening",
        monday: [{ from: "18:00:00", to: "24:00:00" }],
      },
      { id: "heating", name: "Heating", monday: [] },
    ],
    [automation, { id: "other", actions: [] }],
    {
      "schedule.evening": {
        entity_id: "schedule.evening",
        state: "on",
        attributes: { next_event: "2026-11-16T22:00:00+00:00" },
      },
      "automation.evening": {
        entity_id: "automation.evening",
        state: "off",
        attributes: { id: automation.id },
      },
    },
    [
      {
        entity_id: "schedule.evening",
        platform: "schedule",
        unique_id: "evening",
      },
    ],
  );
  assert.equal(schedules.length, 1);
  assert.deepEqual(schedules[0], {
    id: "evening",
    name: "Evening",
    entityId: "schedule.evening",
    enabled: false,
    active: true,
    nextEvent: "2026-11-16T22:00:00+00:00",
    days: week({ monday: [{ from: "18:00", to: "24:00" }] }),
    roomId: "living_room",
    lightIds: [],
  });
});

test("the demo home keeps schedules in its own store", async () => {
  const store = {
    data: createDemo(),
    save(data) {
      this.data = data;
    },
  };
  const core = createCore({ store, randomUUID: () => "one" });
  const days = { monday: [{ from: "07:00", to: "08:00" }] };
  await assert.rejects(
    core.execute("POST", "schedules", { name: "Morning", days }),
    /Choose a room or at least one light/,
  );
  await core.execute("POST", "schedules", {
    name: " Morning ",
    days,
    lightIds: ["light.bedroom_0"],
  });
  await core.execute("PUT", "schedules/one", {
    name: "Morning",
    days,
    roomId: "bedroom",
  });
  await core.execute("POST", "schedules/one/enabled", { enabled: false });
  assert.deepEqual(core.state().schedules, [
    {
      id: "one",
      name: "Morning",
      days: week(days),
      roomId: "bedroom",
      lightIds: [],
      enabled: false,
      active: false,
      nextEvent: null,
    },
  ]);
  await core.execute("DELETE", "schedules/one");
  assert.deepEqual(core.state().schedules, []);
});
