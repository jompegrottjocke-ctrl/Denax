import test from "node:test";
import assert from "node:assert/strict";
import { generate, stepSeconds, validProject } from "../src/pattern.mjs";
for (const style of ["trance", "techno"])
  test(style + " generates a quantized four-on-the-floor groove", () => {
    const p = generate(style, () => 0.1);
    assert.equal(p.length, 6);
    assert.ok(
      p.every((r) => r.length === 16 && r.every((s) => typeof s === "boolean")),
    );
    assert.deepEqual(
      p[0].flatMap((on, i) => (on ? [i] : [])),
      [0, 4, 8, 12],
    );
    assert.deepEqual(
      p[1].flatMap((on, i) => (on ? [i] : [])),
      [4, 12],
    );
    assert.deepEqual(
      p[3].flatMap((on, i) => (on ? [i] : [])),
      [2, 6, 10, 14],
    );
  });
test("tempo gives exactly one bar per 16 steps", () => {
  assert.equal(stepSeconds(120) * 16, 2);
});
test("reject corrupt project structures and levels", () => {
  const p = {
    bpm: 138,
    style: "trance",
    pattern: generate(),
    levels: Array(6).fill(0.5),
    muted: Array(6).fill(false),
  };
  assert.ok(validProject(p));
  assert.ok(!validProject({ ...p, bpm: 0 }));
  assert.ok(!validProject({ ...p, pattern: [] }));
  assert.ok(!validProject({ ...p, levels: [2] }));
});
