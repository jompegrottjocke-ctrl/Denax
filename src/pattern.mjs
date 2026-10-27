export const names = [
  "Kick",
  "Clap",
  "Closed hat",
  "Open hat",
  "Percussion",
  "Bass",
];
export function generate(style = "trance", random = Math.random) {
  return names.map((_, lane) =>
    Array.from({ length: 16 }, (_, step) => {
      if (lane === 0) return step % 4 === 0;
      if (lane === 1) return step === 4 || step === 12;
      if (lane === 2)
        return step % 2 === 0 || random() < (style === "techno" ? 0.38 : 0.12);
      if (lane === 3) return step % 4 === 2;
      if (lane === 4) return step % 4 !== 0 && random() < 0.23;
      return style === "trance"
        ? step % 4 !== 0
        : step % 4 === 2 || random() < 0.18;
    }),
  );
}
export function stepSeconds(bpm) {
  return 60 / bpm / 4;
}
export function validProject(p) {
  return (
    p &&
    Number.isFinite(p.bpm) &&
    p.bpm >= 80 &&
    p.bpm <= 180 &&
    ["trance", "techno"].includes(p.style) &&
    Array.isArray(p.pattern) &&
    p.pattern.length === 6 &&
    p.pattern.every(
      (r) =>
        Array.isArray(r) &&
        r.length === 16 &&
        r.every((x) => typeof x === "boolean"),
    ) &&
    Array.isArray(p.levels) &&
    p.levels.length === 6 &&
    p.levels.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) &&
    Array.isArray(p.muted) &&
    p.muted.length === 6 &&
    p.muted.every((x) => typeof x === "boolean")
  );
}
