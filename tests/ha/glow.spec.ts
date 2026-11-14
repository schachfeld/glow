import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
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

// The phone app's Settings list lights and switches. These tests drive the
// same commands, and check what they did in Home Assistant and in the rooms.
const registry = (entityId: string) =>
  ha.ws("config/entity_registry/get", { entity_id: entityId });
const inventory = async (request: APIRequestContext) =>
  (await (await request.get("/api/state")).json()).inventory;
const command = async (
  request: APIRequestContext,
  path: string,
  data: object,
) => {
  const response = await request.put(`/api/${path}`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
};
const plug = "switch.reading_lamp_plug";
const plugLight = "light.reading_lamp_plug";

test("a switch is shown as a light through a Home Assistant helper, and as a switch again", async ({
  page,
  request,
}) => {
  expect((await inventory(request)).switches).toEqual([
    { id: plug, name: "Reading lamp plug", room: null, lightId: null },
  ]);
  try {
    await command(request, "switch-light", { id: plug, light: true });
    expect((await inventory(request)).switches[0].lightId).toBe(plugLight);
    // Home Assistant has the helper's light, and hides the switch it wraps.
    expect(await registry(plugLight)).toMatchObject({
      platform: "switch_as_x",
      options: { switch_as_x: { entity_id: plug } },
    });
    expect((await registry(plug)).hidden_by).toBe("integration");

    await button(page, "Open Other lights").click();
    await control(page, "switch", "Reading lamp plug power").click();
    await expect.poll(async () => (await ha.state(plug)).state).toBe("on");
    await expect
      .poll(async () => (await light("reading_lamp_plug")).state)
      .toBe("on");
  } finally {
    await command(request, "switch-light", { id: plug, light: false });
  }
  await expect(control(page, "switch", "Reading lamp plug power")).toHaveCount(
    0,
  );
  expect((await inventory(request)).switches[0].lightId).toBeNull();
  expect((await ha.states()).map((s) => s.entity_id)).not.toContain(plugLight);
  expect((await registry(plug)).hidden_by).toBeNull();
  await ha.call("switch", "turn_off", { entity_id: plug });
});

test("a light is taken out of Glow by hiding or disabling it in Home Assistant, or on one device", async ({
  page,
  request,
}) => {
  const porch = "light.porch_light";
  const listed = async (id: string) =>
    (await inventory(request)).lights.find((l: { id: string }) => l.id === id);
  const room = button(page, "Open Other lights");
  expect((await inventory(request)).lights).toHaveLength(5);
  try {
    // Hidden in Home Assistant, which is the default.
    await command(request, "light-shown", { id: porch, shown: false });
    expect((await registry(porch)).hidden_by).toBe("user");
    expect((await listed(porch)).hidden).toBe("hide");
    await expect(room).toHaveCount(0);
    await command(request, "light-shown", { id: porch, shown: true });
    expect((await registry(porch)).hidden_by).toBeNull();
    await expect(room).toBeVisible();

    // On this device only: Home Assistant keeps showing the light.
    await command(request, "hide-mode", { mode: "local" });
    await command(request, "light-shown", { id: porch, shown: false });
    expect(await registry(porch)).toMatchObject({
      hidden_by: null,
      disabled_by: null,
    });
    expect((await listed(porch)).hidden).toBe("local");
    await expect(room).toHaveCount(0);
    await command(request, "light-shown", { id: porch, shown: true });
    await expect(room).toBeVisible();

    // Disabled in Home Assistant. A light from a helper can be enabled
    // again without restarting Home Assistant.
    await command(request, "switch-light", { id: plug, light: true });
    await command(request, "hide-mode", { mode: "disable" });
    await command(request, "light-shown", { id: plugLight, shown: false });
    expect((await registry(plugLight)).disabled_by).toBe("user");
    expect((await listed(plugLight)).hidden).toBe("disable");
    await expect
      .poll(async () => (await ha.states()).map((s) => s.entity_id))
      .not.toContain(plugLight);
    expect(
      await command(request, "light-shown", { id: plugLight, shown: true }),
    ).toEqual({ ok: true, reloadSeconds: 30 });
    expect((await registry(plugLight)).disabled_by).toBeNull();
    expect((await listed(plugLight)).hidden).toBeNull();
  } finally {
    await command(request, "hide-mode", { mode: "hide" });
    await command(request, "light-shown", { id: porch, shown: true });
    await command(request, "switch-light", { id: plug, light: false });
  }
  expect((await inventory(request)).lights).toHaveLength(5);
});
