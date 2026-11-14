import { test, expect, type Page } from "@playwright/test";
import { HomeAssistantClient, resetLights } from "./home-assistant";

const ha = new HomeAssistantClient(
  process.env.GLOW_HA_URL!,
  process.env.GLOW_HA_TOKEN!,
);

const light = (id: string) => ha.state(`light.${id}`);
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const control = (page: Page, role: "switch" | "slider", name: string) =>
  page.getByRole(role, { name, exact: true });

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  await resetLights(ha);
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(button(page, "Open Living room")).toBeVisible();
});

test.afterEach(() => expect(errors).toEqual([]));

test("Home Assistant areas become rooms with their lights", async ({
  page,
}) => {
  await expect(button(page, "Open Bedroom")).toBeVisible();
  await expect(button(page, "Open Other lights")).toBeVisible();
  await button(page, "Open Living room").click();
  await expect(control(page, "switch", "Sofa lamp power")).toBeChecked();
  await expect(control(page, "slider", "Sofa lamp brightness")).toHaveValue(
    "50",
  );
  await expect(
    control(page, "switch", "Ceiling light power"),
  ).not.toBeChecked();
  // Existing Home Assistant scenes show up in the room they control.
  await expect(
    button(page, "Activate Evening glow in Living room"),
  ).toBeVisible();

  await button(page, "All rooms").click();
  await button(page, "Open Bedroom").click();
  await expect(control(page, "switch", "Wardrobe light power")).toBeDisabled();
  await expect(
    page.getByText("0 of 2 lights on", { exact: true }),
  ).toBeVisible();
});

test("room controls switch and dim the lights in Home Assistant", async ({
  page,
}) => {
  await button(page, "Open Living room").click();
  const room = control(page, "switch", "Living room all lights");
  await room.click();
  await expect.poll(async () => (await light("sofa_lamp")).state).toBe("off");
  await expect(room).not.toBeChecked();

  await room.click();
  await expect
    .poll(async () => [
      (await light("sofa_lamp")).state,
      (await light("ceiling_light")).state,
    ])
    .toEqual(["on", "on"]);

  await control(page, "slider", "Room brightness").focus();
  await page.keyboard.press("End");
  await expect
    .poll(async () => [
      (await light("sofa_lamp")).attributes.brightness,
      (await light("ceiling_light")).attributes.brightness,
    ])
    .toEqual([255, 255]);
});

test("room brightness only dims the lights that are already on", async ({
  page,
}) => {
  // The sofa lamp is on and the ceiling light is off.
  await control(page, "slider", "Living room brightness").focus();
  await page.keyboard.press("End");
  await expect
    .poll(async () => (await light("sofa_lamp")).attributes.brightness)
    .toBe(255);
  expect((await light("ceiling_light")).state).toBe("off");

  await button(page, "Open Living room").click();
  await control(page, "slider", "Room brightness").focus();
  await page.keyboard.press("Home");
  await expect
    .poll(async () => (await light("sofa_lamp")).attributes.brightness)
    .toBe(3);
  expect((await light("ceiling_light")).state).toBe("off");

  // With every light off, the slider turns the whole room on.
  const room = control(page, "switch", "Living room all lights");
  await room.click();
  await expect.poll(async () => (await light("sofa_lamp")).state).toBe("off");
  await control(page, "slider", "Room brightness").focus();
  await page.keyboard.press("End");
  await expect
    .poll(async () => [
      (await light("sofa_lamp")).attributes.brightness,
      (await light("ceiling_light")).attributes.brightness,
    ])
    .toEqual([255, 255]);
});

test("colors and whites from the light editor reach the bulb", async ({
  page,
}) => {
  await button(page, "Open Living room").click();
  await page.getByRole("button", { name: "Adjust Sofa lamp" }).click();
  await page
    .getByRole("button", { name: /^Set color / })
    .nth(4)
    .click();
  await expect
    .poll(async () => {
      const { attributes } = await light("sofa_lamp");
      return [attributes.color_mode, attributes.rgb_color];
    })
    .toEqual(["rgb", [131, 181, 213]]);

  await button(page, "Cool").click();
  await expect
    .poll(async () => {
      const { attributes } = await light("sofa_lamp");
      return [attributes.color_mode, attributes.color_temp_kelvin];
    })
    .toEqual(["color_temp", 6000]);
  await expect(button(page, "Cool")).toHaveAttribute("aria-pressed", "true");
});

test("changes made in Home Assistant appear in Glow immediately", async ({
  page,
}) => {
  await button(page, "Open Bedroom").click();
  const bedside = control(page, "slider", "Bedside lamp brightness");
  await expect(bedside).toHaveValue("0");
  await ha.call("light", "turn_on", {
    entity_id: "light.bedside_lamp",
    brightness: 51,
  });
  await expect(control(page, "switch", "Bedside lamp power")).toBeChecked();
  await expect(bedside).toHaveValue("20");

  await button(page, "All rooms").click();
  await button(page, "Open Other lights").click();
  await ha.call("light", "turn_on", { entity_id: "light.porch_light" });
  await expect(control(page, "switch", "Porch light power")).toBeChecked();
});

test("Home Assistant scenes can be activated from Glow", async ({ page }) => {
  await ha.call("light", "turn_on", { entity_id: "light.ceiling_light" });
  await button(page, "Open Living room").click();
  await button(page, "Activate Evening glow in Living room").click();
  await expect
    .poll(async () => {
      const sofa = await light("sofa_lamp");
      return [sofa.attributes.brightness, (await light("ceiling_light")).state];
    })
    .toEqual([77, "off"]);
});

test("scenes made in Glow are saved, applied, and deleted in Home Assistant", async ({
  page,
}) => {
  const haScene = async () =>
    (await ha.states()).find(
      (s) =>
        s.entity_id.startsWith("scene.") &&
        s.attributes.friendly_name === "Reading corner",
    );
  await button(page, "Open Living room").click();
  await button(page, "Create scene").click();
  await page.getByLabel("Scene name", { exact: true }).fill("Reading corner");
  await page.getByRole("button", { name: "Use Ocean palette" }).click();
  await control(page, "slider", "Sofa lamp scene brightness").focus();
  await page.keyboard.press("End");
  await button(page, "Save scene").click();
  await expect(page.getByRole("dialog")).not.toBeVisible();

  await expect.poll(haScene).toBeTruthy();
  const scene = (await haScene())!;
  expect(scene.attributes.entity_id).toEqual(
    expect.arrayContaining(["light.sofa_lamp", "light.ceiling_light"]),
  );

  await ha.call("light", "turn_off", {
    entity_id: ["light.sofa_lamp", "light.ceiling_light"],
  });
  await expect(
    control(page, "switch", "Living room all lights"),
  ).not.toBeChecked();
  await button(page, "Activate Reading corner in Living room").click();
  await expect
    .poll(async () => {
      const sofa = await light("sofa_lamp");
      return [sofa.state, sofa.attributes.brightness];
    })
    .toEqual(["on", 255]);
  await expect(control(page, "switch", "Sofa lamp power")).toBeChecked();

  await button(page, "Edit Reading corner").click();
  await button(page, "Delete scene").click();
  await button(page, "Delete scene").last().click();
  await expect(
    button(page, "Activate Reading corner in Living room"),
  ).toHaveCount(0);
  await expect.poll(haScene).toBeUndefined();
});

test("a schedule is a helper and an automation that switch the lights in Home Assistant", async ({
  page,
}) => {
  const api = async (method: string, path: string, data?: object) => {
    const response = await page.request.fetch(`/api/${path}`, {
      method,
      data: data ?? (method === "GET" ? undefined : {}),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const helpers = (): Promise<any[]> => ha.ws("schedule/list");
  const automation = async () =>
    (await ha.states()).find(
      (s) => s.attributes.id === "glow_schedule_evening_lamps",
    );
  // Home Assistant runs in UTC here. One block holds the current time and the
  // other does not, whenever the test runs.
  const now = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  const time = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const current = {
    from: time(Math.max(0, now - 60)),
    to: time(Math.min(1440, now + 60)),
  };
  const [later, overlapping, merged] =
    now < 720
      ? [
          { from: "18:00", to: "19:30" },
          { from: "19:00", to: "20:00" },
          { from: "18:00:00", to: "20:00:00" },
        ]
      : [
          { from: "06:00", to: "07:30" },
          { from: "07:00", to: "08:00" },
          { from: "06:00:00", to: "08:00:00" },
        ];
  // A day that is not today, so this block never holds the current time.
  const lateDay = new Date().getUTCDay() === 2 ? "wednesday" : "tuesday";

  const created = await api("POST", "schedules", {
    name: "Evening lamps",
    roomId: "living_room",
    days: {
      monday: [later, overlapping],
      [lateDay]: [{ from: "22:00", to: "24:00" }],
    },
  });
  expect(created).toMatchObject({
    id: "evening_lamps",
    entityId: "schedule.evening_lamps",
    enabled: true,
    active: false,
    roomId: "living_room",
  });
  // Overlapping times are stored as one block.
  expect((await helpers())[0]).toMatchObject({
    name: "Evening lamps",
    monday: [merged],
    [lateDay]: [{ from: "22:00:00", to: "24:00:00" }],
    sunday: [],
  });
  await expect.poll(async () => (await automation())?.state).toBe("on");
  expect(
    await ha.rest("config/automation/config/glow_schedule_evening_lamps"),
  ).toMatchObject({
    alias: "Evening lamps",
    triggers: [{ entity_id: "schedule.evening_lamps", to: ["on", "off"] }],
    actions: [{ target: { area_id: ["living_room"] } }],
  });

  // When a block starts, the room's lights turn on; when it ends, off.
  const everyDay = (block: object) =>
    Object.fromEntries(
      [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ].map((day) => [day, [block]]),
    );
  await ha.call("light", "turn_off", { entity_id: "light.sofa_lamp" });
  const edit = { name: "Evening lamps", roomId: "living_room" };
  await api("PUT", "schedules/evening_lamps", {
    ...edit,
    days: everyDay(current),
  });
  await expect
    .poll(async () => [
      (await ha.state("schedule.evening_lamps")).state,
      (await light("sofa_lamp")).state,
      (await light("ceiling_light")).state,
      (await light("bedside_lamp")).state,
    ])
    .toEqual(["on", "on", "on", "off"]);
  await expect
    .poll(async () => (await api("GET", "state")).schedules)
    .toMatchObject([{ id: "evening_lamps", active: true }]);
  await api("PUT", "schedules/evening_lamps", {
    ...edit,
    days: everyDay(later),
  });
  await expect
    .poll(async () => [
      (await light("sofa_lamp")).state,
      (await light("ceiling_light")).state,
    ])
    .toEqual(["off", "off"]);

  // Chosen lights instead of the room, and a new name.
  await api("PUT", "schedules/evening_lamps", {
    name: "Bedside",
    lightIds: ["light.bedside_lamp"],
    days: everyDay(later),
  });
  await expect
    .poll(async () => (await automation())?.attributes.friendly_name)
    .toBe("Bedside");
  expect((await helpers())[0].name).toBe("Bedside");
  expect(
    await ha.rest("config/automation/config/glow_schedule_evening_lamps"),
  ).toMatchObject({
    actions: [{ target: { entity_id: ["light.bedside_lamp"] } }],
  });

  // A paused schedule leaves the lights alone.
  await api("POST", "schedules/evening_lamps/enabled", { enabled: false });
  await expect.poll(async () => (await automation())?.state).toBe("off");
  await expect
    .poll(async () => (await api("GET", "state")).schedules)
    .toMatchObject([{ name: "Bedside", enabled: false, roomId: null }]);
  await api("PUT", "schedules/evening_lamps", {
    name: "Bedside",
    lightIds: ["light.bedside_lamp"],
    days: everyDay(current),
  });
  await expect
    .poll(async () => (await ha.state("schedule.evening_lamps")).state)
    .toBe("on");
  expect((await light("bedside_lamp")).state).toBe("off");

  await api("DELETE", "schedules/evening_lamps");
  expect(await helpers()).toEqual([]);
  await expect.poll(automation).toBeUndefined();
  expect((await api("GET", "state")).schedules).toEqual([]);

  // A schedule made during one of its own times turns its lights on at once.
  await api("POST", "schedules", {
    name: "Right now",
    lightIds: ["light.bedside_lamp"],
    days: everyDay(current),
  });
  await expect.poll(async () => (await light("bedside_lamp")).state).toBe("on");
  await api("DELETE", "schedules/right_now");
  expect(await helpers()).toEqual([]);
});
