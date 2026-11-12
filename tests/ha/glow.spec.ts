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

// Samples a light's brightness in Home Assistant until it reaches `target`.
async function brightnessSteps(id: string, target: number) {
  const seen: number[] = [];
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const brightness = (await light(id)).attributes.brightness as number;
    if (seen.at(-1) !== brightness) seen.push(brightness);
    if (brightness === target) return seen;
  }
  throw new Error(`${id} stopped at ${seen.at(-1)}`);
}

// Presses the mouse on a slider at a share of its width and keeps holding.
async function holdSlider(page: Page, name: string, share: number) {
  const slider = control(page, "slider", name);
  const box = (await slider.boundingBox())!;
  await page.mouse.move(
    box.x + 8 + (box.width - 16) * share,
    box.y + box.height / 2,
  );
  await page.mouse.down();
  // The brightness Home Assistant should end on.
  return Math.round((Number(await slider.inputValue()) * 255) / 100);
}

test("lights glide after a held slider, and letting go sets them at once", async ({
  page,
}) => {
  // The values Home Assistant saw between where the lamp was and the target.
  const between = (steps: number[], from: number) =>
    steps.filter((value) => value !== from && value !== steps.at(-1));

  // Use the strongest smoothing, so the glide is easy to see.
  await button(page, "Settings & help").first().click();
  const smoothing = control(page, "switch", "Smooth light changes");
  const amount = control(page, "slider", "Smoothing amount");
  await expect(smoothing).toHaveAttribute("aria-checked", "true");
  await expect(amount).toHaveAttribute(
    "aria-valuetext",
    "Lights catch up within 0.5 seconds",
  );
  await amount.focus();
  await page.keyboard.press("End");
  await expect(amount).toHaveAttribute(
    "aria-valuetext",
    "Lights catch up within 3.0 seconds",
  );
  await button(page, "Done").click();
  await button(page, "Open Living room").click();

  // Held at the far end, the sofa lamp passes through values on its way up
  // from 50% and arrives while the slider is still held.
  const high = await holdSlider(page, "Sofa lamp brightness", 1);
  const glide = await brightnessSteps("sofa_lamp", high);
  expect(between(glide, 128).length).toBeGreaterThan(0);
  await page.mouse.up();

  // A press that is let go at once does not glide: Home Assistant gets the
  // final value straight away (one frame of the glide may slip in before).
  const low = await holdSlider(page, "Sofa lamp brightness", 0.1);
  await page.mouse.up();
  const jump = await brightnessSteps("sofa_lamp", low);
  expect(between(jump, high).length).toBeLessThanOrEqual(1);

  // With smoothing off, even a held slider sends only the final value.
  await button(page, "Settings & help").first().click();
  await smoothing.click();
  await expect(smoothing).toHaveAttribute("aria-checked", "false");
  await expect(amount).toBeDisabled();
  await button(page, "Done").click();
  const direct = await holdSlider(page, "Sofa lamp brightness", 0.9);
  expect(between(await brightnessSteps("sofa_lamp", direct), low)).toEqual([]);
  await page.mouse.up();

  // The choice is kept for the next visit.
  await page.reload();
  await button(page, "Settings & help").first().click();
  await expect(control(page, "switch", "Smooth light changes")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(control(page, "slider", "Smoothing amount")).toHaveValue("100");
});
