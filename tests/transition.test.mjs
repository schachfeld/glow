import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultTransition,
  lightCommand,
  readTransition,
  transitionText,
} from "../packages/core/transition.mjs";

test("slider values fade, switching does not", () => {
  const ids = ["light.a"];
  assert.deepEqual(lightCommand(ids, { brightness: 40 }, 0.3), {
    ids,
    settings: { brightness: 40 },
    transition: 0.3,
  });
  assert.equal(
    lightCommand(ids, { colorMode: "color_temp", kelvin: 3000 }, 0.5)
      .transition,
    0.5,
  );
  assert.equal(lightCommand(ids, { color: "#ff8800" }, 0.5).transition, 0.5);
  assert.equal("transition" in lightCommand(ids, { on: true }, 0.3), false);
  assert.equal("transition" in lightCommand(ids, { on: false }, 0.3), false);
  // At 0, Glow leaves the fade to the light.
  assert.equal("transition" in lightCommand(ids, { brightness: 40 }, 0), false);
});

test("the saved fade time is read back safely", () => {
  assert.equal(readTransition(null), defaultTransition);
  assert.equal(readTransition("nonsense"), defaultTransition);
  assert.equal(readTransition("0"), 0);
  assert.equal(readTransition(3 * 0.1), 0.3);
  assert.equal(readTransition(99), 2);
  assert.equal(readTransition(-1), 0);
  assert.equal(transitionText(0), "Off");
  assert.equal(transitionText(1), "1.0 s");
});
