import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
  validateV2,
  migrateProject,
  eventsAt,
  resizeSong,
  presetArrangement,
  songSeconds,
} from "../src/project.mjs";
import { generate } from "../src/pattern.mjs";

test("default arrangement is valid and distinguishes intro, breakdown and drop", () => {
  const p = createProject();
  assert.ok(validateV2(p));
  assert.equal(p.arrangement[0][0], 0);
  assert.equal(p.arrangement[6][0], null);
  assert.equal(p.arrangement[0][16], null);
  assert.notEqual(p.arrangement[6][16], null);
  assert.ok(p.arrangement.every((row) => row[24] !== null));
});
test("event planner follows clips per lane rather than currently edited pattern", () => {
  const p = createProject();
  p.arrangement = p.arrangement.map((r) => r.map(() => null));
  p.patterns[1].melody[0] = 72;
  p.patterns[1].leadLengths[0] = 4;
  p.arrangement[6][1] = 1;
  p.selected = 0;
  assert.deepEqual(eventsAt(p, 0), []);
  assert.deepEqual(eventsAt(p, 16), [
    { lane: 6, midi: 72, length: 4, pattern: 1 },
  ]);
  p.patterns[0].melody[0] = 69;
  assert.equal(eventsAt(p, 16, "loop").find((e) => e.lane === 6).midi, 69);
  assert.deepEqual(eventsAt(p, p.bars * 16), []);
});
test("mute, solo and melodic pauses affect event planning", () => {
  const p = createProject();
  p.arrangement = presetArrangement(32);
  p.solo[6] = true;
  assert.ok(eventsAt(p, 24 * 16).every((e) => e.lane === 6));
  p.muted[6] = true;
  assert.deepEqual(eventsAt(p, 24 * 16), []);
  p.muted[6] = false;
  p.patterns[p.arrangement[6][24]].melody[0] = null;
  assert.deepEqual(eventsAt(p, 24 * 16), []);
});
test("resize keeps earlier clips, appends silence and rejects invalid lengths", () => {
  const p = createProject(),
    first = p.arrangement[0][0];
  resizeSong(p, 64);
  assert.equal(p.arrangement[0][0], first);
  assert.ok(p.arrangement.every((r) => r.slice(32).every((x) => x === null)));
  assert.ok(validateV2(p));
  resizeSong(p, 4);
  assert.ok(p.arrangement.every((r) => r.length === 4));
  assert.throws(() => resizeSong(p, 129));
});
test("legacy project migration preserves sounds, mix, tempo and melody", () => {
  const old = {
    version: 1,
    bpm: 144,
    style: "techno",
    pattern: generate("techno"),
    levels: Array(6).fill(0.5),
    muted: [true, false, false, false, false, false],
    melody: Array(16).fill(72),
    leadLevel: 0.4,
  };
  const p = migrateProject(old);
  assert.ok(validateV2(p));
  assert.equal(p.bpm, 144);
  assert.deepEqual(p.patterns[0].drums, old.pattern);
  assert.equal(p.levels[6], 0.4);
  assert.deepEqual(p.patterns[0].melody, old.melody);
  assert.equal(p.arrangement[6][0], 0);
  assert.equal(p.muted[0], true);
  p.patterns[0].drums[0][0] = !p.patterns[0].drums[0][0];
  assert.notDeepEqual(p.patterns[0].drums, old.pattern);
});
test("saved v2 round trip preserves note gates, clips and mix without shared references", () => {
  const p = createProject();
  p.patterns[2].leadLengths[0] = 3;
  p.arrangement[4][6] = null;
  p.solo[2] = true;
  const restored = migrateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored, p);
  restored.levels[0] = 0;
  assert.notEqual(restored.levels[0], p.levels[0]);
});
test("reject corrupt arrangements, note ranges, missing patterns and mixer values", () => {
  for (const corrupt of [
    (p) => (p.arrangement[0][0] = 7),
    (p) => (p.patterns[0].melody[0] = NaN),
    (p) => (p.patterns[0].bassLengths[0] = 0),
    (p) => (p.levels[0] = 2),
    (p) => p.solo.pop(),
    (p) => (p.cutoff = -1),
    (p) => (p.patterns = []),
    (p) => (p.selected = -1),
  ]) {
    const p = createProject();
    corrupt(p);
    assert.equal(validateV2(p), false);
    assert.throws(() => migrateProject(p));
  }
});
test("WAV duration in full song mode is tied to bar count and BPM", () => {
  const p = createProject();
  p.bpm = 120;
  resizeSong(p, 32);
  assert.equal(songSeconds(p), 64);
  resizeSong(p, 128);
  assert.equal(songSeconds(p), 256);
});
test("loaded sample data and unknown properties stay outside composition undo snapshots", () => {
  const p = {
    ...createProject(),
    files: [{ data: "binary payload" }],
    unknown: "extra",
  };
  const restored = migrateProject(p);
  assert.equal(restored.files, undefined);
  assert.equal(restored.unknown, undefined);
  assert.ok(validateV2(restored));
});
