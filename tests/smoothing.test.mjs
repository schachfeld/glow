import test from "node:test";
import assert from "node:assert/strict";
import {
  createFollower,
  normalizeSmoothing,
  smoothingDefaults,
  smoothingSeconds,
  smoothingTime,
} from "../packages/core/smoothing.mjs";

// A fake clock and frame loop, so each test controls time exactly.
function frames() {
  let time = 0;
  let queued = null;
  return {
    options: {
      now: () => time,
      frame: (run) => {
        queued = run;
        return 1;
      },
      cancel: () => {
        queued = null;
      },
    },
    advance(ms) {
      time += ms;
      const run = queued;
      queued = null;
      run?.();
    },
    get pending() {
      return queued !== null;
    },
  };
}

test("without smoothing, the light gets the slider value at once", () => {
  const sent = [];
  const follower = createFollower((value) => sent.push(value));
  follower.to(80, { from: 20, time: 0 });
  assert.deepEqual(sent, [80]);
  assert.equal(follower.moving, false);
});

test("with smoothing, the light eases toward the thumb and ends on it", async () => {
  const clock = frames();
  const sent = [];
  const follower = createFollower((value) => sent.push(value), clock.options);
  follower.to(100, { from: 0, time: 100 });
  assert.deepEqual(sent, []);
  const settled = follower.settled();
  for (let i = 0; i < 100 && clock.pending; i++) clock.advance(16);
  await settled;
  assert.equal(sent.at(-1), 100);
  assert.ok(sent.length > 5, "sends steps along the way");
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i] > sent[i - 1]);
  // Big steps first, then smaller ones: a lerp, not a linear ramp.
  assert.ok(sent[0] > 10 && sent[0] < 30);
});

test("the light retargets mid-move without starting over", () => {
  const clock = frames();
  const sent = [];
  const follower = createFollower((value) => sent.push(value), clock.options);
  follower.to(100, { from: 0, time: 100 });
  clock.advance(100);
  const reached = sent.at(-1);
  follower.to(0, { from: 100, time: 100 });
  clock.advance(16);
  assert.ok(sent.at(-1) < reached && sent.at(-1) > 0);
});

test("values round to the slider step and flush jumps to the target", () => {
  const clock = frames();
  const sent = [];
  const follower = createFollower((value) => sent.push(value), clock.options);
  follower.to(6500, { from: 2700, time: 200, step: 50 });
  clock.advance(16);
  clock.advance(16);
  assert.ok(sent.every((value) => value % 50 === 0));
  follower.flush();
  assert.equal(sent.at(-1), 6500);
  assert.equal(follower.moving, false);
});

test("a slider set to its own value still sends it", () => {
  const sent = [];
  const follower = createFollower((value) => sent.push(value));
  follower.to(40, { from: 40, time: 100 });
  assert.deepEqual(sent, [40]);
});

test("the setting is clamped and defaults when missing", () => {
  assert.deepEqual(normalizeSmoothing(null), smoothingDefaults);
  assert.deepEqual(normalizeSmoothing({ enabled: false, amount: 250 }), {
    enabled: false,
    amount: 100,
  });
  assert.equal(smoothingTime({ enabled: false, amount: 50 }), 0);
  assert.ok(
    smoothingTime({ enabled: true, amount: 100 }) >
      smoothingTime(smoothingDefaults),
  );
  assert.equal(smoothingSeconds(smoothingDefaults), 0.35);
});
