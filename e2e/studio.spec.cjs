const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const { Buffer } = require("node:buffer");
let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".step")).toHaveCount(96);
});
test.afterEach(async () => expect(errors).toEqual([]));
async function save(page, path) {
  const event = page.waitForEvent("download");
  await page.click("#save");
  await (await event).saveAs(path);
  return JSON.parse(await fs.readFile(path, "utf8"));
}
async function exportWav(page, path) {
  const event = page.waitForEvent("download");
  await page.click("#export");
  await (await event).saveAs(path);
  return fs.readFile(path);
}
function hasSignal(bytes) {
  for (let i = 44; i < bytes.length; i += 2)
    if (bytes.readInt16LE(i) !== 0) return true;
  return false;
}

test("arrange pattern clips, undo, redo, duplicate and rename", async ({
  page,
}) => {
  const cell = page.getByRole("button", {
    name: "Trance lead, takt 1: tom",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Redigera Mönster B", exact: true })
    .click();
  await cell.click();
  await expect(
    page.getByRole("button", {
      name: "Trance lead, takt 1: Mönster B",
      exact: true,
    }),
  ).toHaveText("B");
  await page.click("#undo");
  await expect(cell).toBeVisible();
  await page.click("#redo");
  await expect(
    page.getByRole("button", {
      name: "Trance lead, takt 1: Mönster B",
      exact: true,
    }),
  ).toBeVisible();
  await page.click("#duplicate");
  await expect(page.locator("#patterns button")).toHaveCount(5);
  await page.locator("#pattern-name").fill("Drop lead");
  await page.locator("#pattern-name").blur();
  await expect(page.locator("#editing-label")).toContainText("Drop lead");
  await page.selectOption("#bars", "64");
  await expect(page.locator("[data-bar]")).toHaveCount(7 * 64);
});
test("piano roll writes pitched notes, gates and bass and project round trip retains them", async ({
  page,
}, info) => {
  await page.click("#piano-tab");
  await expect(page.locator(".piano-cell")).toHaveCount(400);
  await page.selectOption("#note-length", "4");
  const note = page.locator('[data-pitch="79"][data-step="0"]');
  await note.click();
  await expect(note).toHaveAttribute("aria-pressed", "true");
  await page.selectOption("#instrument", "bass");
  await page.locator('[data-pitch="36"][data-step="0"]').click();
  const path = info.outputPath("roundtrip.json"),
    p = await save(page, path);
  expect(p.version).toBe(2);
  expect(p.patterns[0].melody[0]).toBe(79);
  expect(p.patterns[0].leadLengths[0]).toBe(4);
  expect(p.patterns[0].bass[0]).toBe(36);
  expect(p.patterns[0].drums[5][0]).toBe(true);
  await page.locator("#bpm").fill("150");
  await page.locator("#bpm").blur();
  await page.setInputFiles("#project-input", path);
  await expect(page.locator("#status")).toContainText("Projekt laddat");
  await expect(page.locator("#bpm")).toHaveValue("138");
  const restored = await save(page, info.outputPath("restored.json"));
  expect(restored).toEqual(p);
});
test("song playback seeks, pauses, resumes and ends at the selected length", async ({
  page,
}) => {
  await page.selectOption("#bars", "4");
  await page.locator("#bpm").fill("180");
  await page.locator("#bpm").blur();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.click("#play");
  await expect(page.locator("#position")).toHaveText(/^4\./);
  await expect(page.locator(".current")).toHaveCount(6);
  await page.click("#play");
  await expect(page.locator("#engine")).toContainText("Pausad");
  await page.click("#play");
  await expect(page.locator("#status")).toContainText("färdigspelad", {
    timeout: 5000,
  });
  await expect(page.locator("#position")).toHaveText("1.1.1");
  await page.selectOption("#mode", "loop");
  await page.click("#play");
  await expect(page.locator("#engine")).toContainText("Spelar");
  await page.click("#stop");
  await expect(page.locator(".current")).toHaveCount(0);
});
test("full-song export has correct duration; mute and master zero produce silence", async ({
  page,
}, info) => {
  await page.selectOption("#bars", "4");
  await page.locator("#bpm").fill("120");
  await page.locator("#bpm").blur();
  await page.click("#template");
  const bytes = await exportWav(page, info.outputPath("song.wav"));
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.readUInt32LE(24)).toBe(48000);
  expect(bytes.readUInt16LE(22)).toBe(2);
  expect(bytes.length).toBe(44 + 8 * 48000 * 4);
  expect(hasSignal(bytes)).toBe(true);
  for (const name of [
    "Kick",
    "Clap",
    "Closed hat",
    "Open hat",
    "Percussion",
    "Bass",
    "Trance lead",
  ])
    await page
      .getByRole("button", { name: "Mute " + name + " mixer", exact: true })
      .click();
  expect(hasSignal(await exportWav(page, info.outputPath("muted.wav")))).toBe(
    false,
  );
  await page.click("#undo");
  await page
    .getByRole("slider", { name: "Master mixernivå", exact: true })
    .fill("0");
  expect(
    hasSignal(await exportWav(page, info.outputPath("master-zero.wav"))),
  ).toBe(false);
});
test("sample import, assignment and embedded project audio survive reopening", async ({
  page,
}, info) => {
  const size = 4800,
    buffer = Buffer.alloc(44 + size * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(48000, 24);
  buffer.writeUInt32LE(96000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(size * 2, 40);
  for (let i = 0; i < size; i++)
    buffer.writeInt16LE(Math.round(10000 * Math.sin(i * 0.1)), 44 + i * 2);
  await page.setInputFiles("#bank-input", {
    name: "My kick.wav",
    mimeType: "audio/wav",
    buffer,
  });
  await expect(page.locator(".library-item")).toHaveCount(1);
  await page.locator(".library-item .assign button").first().click();
  await expect(page.locator(".track-name small").first()).toHaveText(
    "My kick.wav",
  );
  const path = info.outputPath("samples.json");
  const p = await save(page, path);
  expect(p.files[0].name).toBe("My kick.wav");
  expect(Buffer.from(p.files[0].data, "base64")).toEqual(buffer);
  await page.setInputFiles("#project-input", path);
  await expect(page.locator("#status")).toContainText("Projekt laddat");
  await expect(page.locator(".track-name small").first()).toHaveText(
    "My kick.wav",
  );
  const restored = await save(page, info.outputPath("sample-restored.json"));
  expect(restored.files).toEqual(p.files);
});
test("legacy project opens and corrupt files leave the current song unchanged", async ({
  page,
}, info) => {
  const legacy = {
    version: 1,
    bpm: 144,
    style: "trance",
    pattern: Array.from({ length: 6 }, () => Array(16).fill(false)),
    levels: Array(6).fill(0.5),
    muted: Array(6).fill(false),
    melody: Array(16).fill(72),
    leadLevel: 0.4,
    files: Array(6).fill(null),
  };
  await page.setInputFiles("#project-input", {
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.locator("#status")).toContainText("Projekt laddat");
  await expect(page.locator("#bpm")).toHaveValue("144");
  const before = await save(page, info.outputPath("before.json"));
  await page.setInputFiles("#project-input", {
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2}'),
  });
  await expect(page.locator("#status")).toContainText("Kunde inte öppna");
  const after = await save(page, info.outputPath("after.json"));
  expect(after).toEqual(before);
});
