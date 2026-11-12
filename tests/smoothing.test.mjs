import test from "node:test";
import assert from "node:assert/strict";
import {
  createFollower,
  normalizeSmoothing,
  smoothingDefaults,
  smoothingFactor,
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
    get time() {
      return time;
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

function follow(clock) {
  const sent = [];
  const follower = createFollower((value) => sent.push(value), clock?.options);
  return { sent, follower };
}

test("without smoothing, the light gets the slider value at once", () => {
  const { sent, follower } = follow();
  follower.to(80, { from: 20, time: 0 });
  assert.deepEqual(sent, [80]);
  assert.equal(follower.moving, false);
});

test("while held, the light glides after the thumb and ends on it", () => {
  const clock = frames();
  const { sent, follower } = follow(clock);
  follower.to(100, { from: 0, time: 60 });
  assert.deepEqual(sent, []);
  for (let i = 0; i < 100 && clock.pending; i++) clock.advance(16);
  assert.equal(sent.at(-1), 100);
  assert.equal(follower.moving, false);
  assert.ok(sent.length > 5, "sends steps along the way");
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i] > sent[i - 1]);
  // Big steps first, then smaller ones: a lerp, not a linear ramp.
  assert.ok(sent[0] > 10 && sent[0] < 40);
});

test("by default each frame covers 0.8 of the way to the slider", () => {
  assert.equal(smoothingFactor(smoothingDefaults), 0.8);
  assert.equal(smoothingFactor({ enabled: true, amount: 0 }), 1);
  assert.ok(
    Math.abs(smoothingFactor({ enabled: true, amount: 100 }) - 0.2) < 1e-9,
  );
  assert.equal(smoothingFactor({ enabled: false, amount: 100 }), 1);

  // At 60 frames a second: light += (slider - light) * 0.8.
  const clock = frames();
  const { sent, follower } = follow(clock);
  follower.to(100, { from: 0, time: smoothingTime(smoothingDefaults) });
  clock.advance(1000 / 60);
  clock.advance(1000 / 60);
  clock.advance(1000 / 60);
  assert.deepEqual(sent, [80, 96, 99]);

  // Two frames at 120 a second cover the same ground as one at 60.
  const fast = frames();
  const double = follow(fast);
  double.follower.to(100, { from: 0, time: smoothingTime(smoothingDefaults) });
  fast.advance(1000 / 120);
  fast.advance(1000 / 120);
  assert.equal(double.sent.at(-1), 80);
});

test("a move across the whole track catches up in the time shown", () => {
  for (const amount of [0, 25, 60, 100]) {
    const smoothing = { enabled: true, amount };
    const clock = frames();
    const { sent, follower } = follow(clock);
    follower.to(100, { from: 1, time: smoothingTime(smoothing) });
    while (clock.pending) clock.advance(4);
    assert.equal(sent.at(-1), 100);
    const shown = smoothingSeconds(smoothing) * 1000;
    assert.ok(Math.abs(clock.time - shown) <= 15, `${clock.time} of ${shown}`);
  }
  assert.equal(smoothingSeconds(smoothingDefaults), 0.05);
  assert.equal(smoothingSeconds({ amount: 100 }), 0.4);
});

test("every move of the thumb retargets the glide at once", () => {
  const clock = frames();
  const { sent, follower } = follow(clock);
  // Down to 10%, then straight up to 90% before the light got there.
  follower.to(10, { from: 50, time: 60 });
  clock.advance(16);
  const low = sent.at(-1);
  assert.ok(low < 50 && low > 10);
  follower.to(90, { from: 10, time: 60 });
  clock.advance(16);
  // The very next frame heads up from where the light is, not from 10%.
  assert.ok(sent.at(-1) > low);
  for (let i = 0; i < 100 && clock.pending; i++) clock.advance(16);
  assert.equal(sent.at(-1), 90);
  assert.ok(Math.min(...sent) >= low - 1, "never finishes the trip to 10%");
});

test("letting go ends the glide and sets the light at once", () => {
  const clock = frames();
  const { sent, follower } = follow(clock);
  follower.to(90, { from: 10, time: 150 });
  clock.advance(16);
  assert.ok(sent.at(-1) < 90);
  follower.flush();
  assert.equal(sent.at(-1), 90);
  assert.equal(follower.moving, false);
  assert.equal(clock.pending, false);
  // Nothing more arrives afterwards.
  const count = sent.length;
  clock.advance(500);
  assert.equal(sent.length, count);
});

test("values round to the slider step", () => {
  const clock = frames();
  const { sent, follower } = follow(clock);
  follower.to(6500, { from: 2700, time: 100, step: 50 });
  clock.advance(16);
  clock.advance(16);
  assert.ok(sent.length > 0 && sent.every((value) => value % 50 === 0));
});

test("a slider set to its own value still sends it", () => {
  const { sent, follower } = follow();
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
});
