import { generate, names, stepSeconds, validProject } from "./pattern.mjs";
export const channelNames = [...names, "Trance lead"];
export const patternLetter = (i) => String.fromCharCode(65 + i);
export const noteName = (n) =>
  n === null
    ? "Paus"
    : ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][
        n % 12
      ] +
      (Math.floor(n / 12) - 1);
export function makePattern(style = "trance", root = 0) {
  const melody = [
    69, 76, 81, 76, 72, 79, 84, 79, 65, 72, 77, 72, 67, 74, 79, 74,
  ].map((n) => n + root);
  return {
    drums: generate(style),
    melody,
    bass: Array(16).fill(33 + root),
    leadLengths: Array(16).fill(1),
    bassLengths: Array(16).fill(1),
  };
}
export function presetArrangement(bars, count = 4) {
  return channelNames.map((_, lane) =>
    Array.from({ length: bars }, (_, bar) => {
      const section = Math.min(3, Math.floor(bar / (bars / 4)));
      const enabled =
        section === 0
          ? [0, 2, 4]
          : section === 1
            ? [0, 1, 2, 3, 4, 5]
            : section === 2
              ? [2, 6]
              : [0, 1, 2, 3, 4, 5, 6];
      return enabled.includes(lane) ? Math.floor(bar / 4) % count : null;
    }),
  );
}
export function createProject() {
  return {
    version: 2,
    bpm: 138,
    style: "trance",
    patterns: [0, -5, -4, -2].map((root) => makePattern("trance", root)),
    selected: 0,
    bars: 32,
    arrangement: presetArrangement(32),
    levels: [0.85, 0.65, 0.45, 0.4, 0.4, 0.45, 0.5],
    muted: Array(7).fill(false),
    solo: Array(7).fill(false),
    master: 0.8,
    cutoff: 4200,
    delay: 0.32,
  };
}
const arrayOf = (x, n, predicate) =>
  Array.isArray(x) && x.length === n && x.every(predicate);
const integer = (x, a, b) => Number.isInteger(x) && x >= a && x <= b;
const unit = (x) => Number.isFinite(x) && x >= 0 && x <= 1;
const note = (x) => x === null || integer(x, 24, 96);
export function validateV2(p) {
  if (
    !p ||
    p.version !== 2 ||
    !integer(p.bars, 4, 128) ||
    !Number.isFinite(p.bpm) ||
    p.bpm < 80 ||
    p.bpm > 180 ||
    !["trance", "techno"].includes(p.style)
  )
    return false;
  if (
    !Array.isArray(p.patterns) ||
    p.patterns.length < 1 ||
    p.patterns.length > 8 ||
    !integer(p.selected, 0, p.patterns.length - 1)
  )
    return false;
  if (
    !p.patterns.every(
      (v) =>
        v &&
        (v.name === undefined ||
          (typeof v.name === "string" && v.name.length <= 24)) &&
        arrayOf(v.drums, 6, (r) =>
          arrayOf(r, 16, (x) => typeof x === "boolean"),
        ) &&
        arrayOf(v.melody, 16, note) &&
        arrayOf(v.bass, 16, note) &&
        arrayOf(v.leadLengths, 16, (x) => integer(x, 1, 4)) &&
        arrayOf(v.bassLengths, 16, (x) => integer(x, 1, 4)),
    )
  )
    return false;
  return (
    arrayOf(p.arrangement, 7, (r) =>
      arrayOf(
        r,
        p.bars,
        (x) => x === null || integer(x, 0, p.patterns.length - 1),
      ),
    ) &&
    arrayOf(p.levels, 7, unit) &&
    arrayOf(p.muted, 7, (x) => typeof x === "boolean") &&
    arrayOf(p.solo, 7, (x) => typeof x === "boolean") &&
    unit(p.master) &&
    Number.isFinite(p.cutoff) &&
    p.cutoff >= 200 &&
    p.cutoff <= 10000 &&
    unit(p.delay)
  );
}
export function migrateProject(p) {
  if (p?.version === 2) {
    if (!validateV2(p)) throw Error("Ogiltigt Denax-projekt.");
    return Object.fromEntries(
      [
        "version",
        "bpm",
        "style",
        "patterns",
        "selected",
        "bars",
        "arrangement",
        "levels",
        "muted",
        "solo",
        "master",
        "cutoff",
        "delay",
      ].map((key) => [key, structuredClone(p[key])]),
    );
  }
  if (p?.version !== 1 || !validProject(p))
    throw Error("Ogiltigt Denax-projekt.");
  if (p.melody !== undefined && !arrayOf(p.melody, 16, note))
    throw Error("Ogiltig melodi.");
  if (p.leadLevel !== undefined && !unit(p.leadLevel))
    throw Error("Ogiltig synthnivå.");
  const next = createProject();
  next.bpm = p.bpm;
  next.style = p.style;
  next.patterns = [
    {
      ...makePattern(p.style),
      drums: structuredClone(p.pattern),
      melody: p.melody || Array(16).fill(null),
    },
  ];
  next.selected = 0;
  next.bars = 4;
  next.arrangement = channelNames.map(() => Array(4).fill(0));
  next.levels = [...p.levels, p.leadLevel ?? 0.5];
  next.muted = [...p.muted, false];
  return next;
}
export function audible(project, lane) {
  return (
    !project.muted[lane] && (!project.solo.some(Boolean) || project.solo[lane])
  );
}
// Both realtime playback and WAV export use this same event plan.
export function eventsAt(project, absoluteStep, mode = "song") {
  const bar = Math.floor(absoluteStep / 16),
    step = absoluteStep % 16;
  if (mode === "song" && bar >= project.bars) return [];
  return channelNames.flatMap((_, lane) => {
    if (!audible(project, lane)) return [];
    const index =
      mode === "loop" ? project.selected : project.arrangement[lane][bar];
    if (index === null) return [];
    const p = project.patterns[index];
    if (lane < 6 && !p.drums[lane][step]) return [];
    const midi = lane === 6 ? p.melody[step] : lane === 5 ? p.bass[step] : null;
    if (lane >= 5 && midi === null) return [];
    return [
      {
        lane,
        midi,
        length:
          lane === 6
            ? p.leadLengths[step]
            : lane === 5
              ? p.bassLengths[step]
              : 1,
        pattern: index,
      },
    ];
  });
}
export function resizeSong(p, bars) {
  if (!integer(bars, 4, 128)) throw Error("Välj 4–128 takter.");
  p.arrangement = p.arrangement.map((r) =>
    Array.from({ length: bars }, (_, i) => r[i] ?? null),
  );
  p.bars = bars;
}
export function songSeconds(p) {
  return p.bars * 16 * stepSeconds(p.bpm);
}
