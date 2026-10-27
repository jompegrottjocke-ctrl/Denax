import { generate, names, stepSeconds } from "./pattern.mjs";
import {
  createProject,
  makePattern,
  migrateProject,
  channelNames,
  patternLetter,
  noteName,
  presetArrangement,
  resizeSong,
  eventsAt,
  songSeconds,
} from "./project.mjs";
import { trigger, master, wav, lead } from "./audio.js";

const $ = (id) => document.getElementById(id);
const colors = [
  "#b9ef80",
  "#b2a0ed",
  "#edc17e",
  "#7fc6c7",
  "#dc93af",
  "#91aeea",
  "#b2a0ed",
];
let project = createProject(),
  samples = Array(6).fill(null),
  files = Array(6).fill(null),
  library = [];
let ctx,
  bus,
  previewBus,
  timer,
  playing = false,
  paused = false,
  nextTime = 0,
  cursor = 0,
  playhead = 0,
  generation = 0,
  selectedLane = 0;
let undoStack = [],
  redoStack = [],
  importing = false,
  exporting = false;
let savedComposition = JSON.stringify(project),
  savedFiles = files.map((f) => f?.bytes);
function markSaved() {
  savedComposition = JSON.stringify(project);
  savedFiles = files.map((f) => f?.bytes);
}
const current = () => project.patterns[project.selected];
const mode = () => $("mode").value;
const status = (text) => ($("status").textContent = text);
const copy = (value) => structuredClone(value);
const patternName = (i) =>
  project.patterns[i].name || `Mönster ${patternLetter(i)}`;
function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    previewBus = master(ctx, 0.65);
  }
  return ctx;
}
function historyButtons() {
  $("undo").disabled = !undoStack.length;
  $("redo").disabled = !redoStack.length;
}
function edit(change, rerender = true) {
  undoStack.push(copy(project));
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  change();
  if (rerender) renderAll();
  else historyButtons();
}
function restoreHistory(from, to) {
  if (!from.length) return;
  stop();
  to.push(copy(project));
  project = from.pop();
  renderAll();
  status("Ändringen återställd.");
}
$("undo").onclick = () => restoreHistory(undoStack, redoStack);
$("redo").onclick = () => restoreHistory(redoStack, undoStack);

function renderAll() {
  $("bpm").value = project.bpm;
  $("style").value = project.style;
  if (![...$("bars").options].some((o) => Number(o.value) === project.bars)) {
    const o = new Option(String(project.bars), String(project.bars));
    $("bars").add(o);
  }
  $("bars").value = project.bars;
  $("pattern-name").value = current().name || "";
  $("editing-label").textContent = `${patternName(project.selected)} · 1 takt`;
  $("cutoff").value = project.cutoff;
  $("cutoff-value").textContent = (project.cutoff / 1000).toFixed(1) + " kHz";
  $("delay").value = project.delay;
  $("song-length").textContent =
    `${project.bars} takter · ${Math.floor(songSeconds(project) / 60)}:${String(Math.round(songSeconds(project) % 60)).padStart(2, "0")}`;
  renderPatterns();
  renderTimeline();
  renderDrums();
  renderPiano();
  renderMixer();
  historyButtons();
  if (bus && playing)
    bus.gain.setTargetAtTime(project.master, ctx.currentTime, 0.01);
}
function renderPatterns() {
  $("patterns").replaceChildren();
  project.patterns.forEach((p, i) => {
    const b = document.createElement("button");
    b.textContent = patternLetter(i);
    b.className = i === project.selected ? "selected" : "";
    b.title = patternName(i);
    b.setAttribute("aria-label", "Redigera " + patternName(i));
    b.setAttribute("aria-pressed", String(i === project.selected));
    b.onclick = () => {
      project.selected = i;
      renderAll();
    };
    $("patterns").append(b);
  });
  $("duplicate").disabled = project.patterns.length >= 8;
}
$("duplicate").onclick = () =>
  edit(() => {
    const p = copy(current());
    delete p.name;
    project.patterns.push(p);
    project.selected = project.patterns.length - 1;
  });
$("pattern-name").onchange = (e) =>
  edit(() => (current().name = e.target.value.trim()));
function renderTimeline() {
  const el = $("timeline");
  el.replaceChildren();
  const sections = document.createElement("div");
  sections.className = "timeline-sections";
  ["INTRO", "BUILD", "BREAKDOWN", "DROP"].forEach((name, i) => {
    const span = document.createElement("span");
    span.textContent = name;
    span.style.width = (project.bars / 4) * 45 - 2 + "px";
    sections.append(span);
  });
  el.append(sections);
  const ruler = document.createElement("div");
  ruler.className = "timeline-row ruler";
  const label = document.createElement("span");
  label.className = "timeline-label";
  label.textContent = "TAKT / SÖKPOSITION";
  ruler.append(label);
  for (let bar = 0; bar < project.bars; bar++) {
    const b = document.createElement("button");
    b.className = "bar";
    b.textContent = bar + 1;
    b.title = "Spela från takt " + (bar + 1);
    b.onclick = () => {
      stop();
      cursor = bar * 16;
      playhead = cursor;
      paused = true;
      updatePosition(cursor);
      status("Startposition: takt " + (bar + 1) + ".");
    };
    ruler.append(b);
  }
  el.append(ruler);
  channelNames.forEach((name, lane) => {
    const row = document.createElement("div");
    row.className = "timeline-row";
    row.style.setProperty("--color", colors[lane]);
    const label = document.createElement("span");
    label.className = "timeline-label";
    label.textContent = name;
    row.append(label);
    for (let bar = 0; bar < project.bars; bar++) {
      const index = project.arrangement[lane][bar];
      const b = document.createElement("button");
      b.className = "bar" + (index !== null ? " clip" : "");
      b.dataset.bar = bar;
      b.textContent = index === null ? "" : patternLetter(index);
      b.setAttribute(
        "aria-label",
        `${name}, takt ${bar + 1}: ${index === null ? "tom" : patternName(index)}`,
      );
      b.setAttribute("aria-pressed", String(index !== null));
      b.onclick = () =>
        edit(
          () =>
            (project.arrangement[lane][bar] =
              index === project.selected ? null : project.selected),
        );
      b.oncontextmenu = (e) => {
        e.preventDefault();
        if (index !== null) edit(() => (project.arrangement[lane][bar] = null));
      };
      row.append(b);
    }
    el.append(row);
  });
}
$("bars").onchange = (e) => {
  const n = Number(e.target.value);
  stop();
  edit(() => resizeSong(project, n));
  status("Låtlängd: " + n + " takter.");
};
$("template").onclick = () =>
  edit(
    () =>
      (project.arrangement = presetArrangement(
        project.bars,
        project.patterns.length,
      )),
  );
$("clear-song").onclick = () =>
  edit(
    () =>
      (project.arrangement = channelNames.map(() =>
        Array(project.bars).fill(null),
      )),
  );
for (let i = 0; i < 16; i++) {
  const s = document.createElement("span");
  s.textContent = i + 1;
  $("numbers").append(s);
}
function renderDrums() {
  $("tracks").replaceChildren();
  names.forEach((name, lane) => {
    const row = document.createElement("div");
    row.className = "track";
    row.style.setProperty("--color", colors[lane]);
    const info = document.createElement("div");
    info.className = "track-info";
    const mute = document.createElement("button");
    mute.className = "mute" + (project.muted[lane] ? " muted" : "");
    mute.textContent = String(lane + 1).padStart(2, "0");
    mute.setAttribute("aria-label", "Mute " + name);
    mute.setAttribute("aria-pressed", String(project.muted[lane]));
    mute.onclick = () =>
      edit(() => (project.muted[lane] = !project.muted[lane]));
    const title = document.createElement("div");
    title.className = "track-name";
    const strong = document.createElement("strong");
    strong.textContent = name;
    const sub = document.createElement("small");
    sub.textContent = files[lane]?.name || "DENAX / SYNTH";
    sub.title = sub.textContent;
    title.append(strong, sub);
    const load = document.createElement("button");
    load.className = "import";
    load.textContent = "Ljud";
    load.title = "Importera till " + name;
    load.onclick = () => {
      selectedLane = lane;
      $("sample-input").click();
    };
    info.append(mute, title, load);
    const steps = document.createElement("div");
    steps.className = "steps";
    current().drums[lane].forEach((on, i) => {
      const b = document.createElement("button");
      b.className = "step" + (on ? " on" : "");
      b.dataset.step = i;
      b.setAttribute("aria-label", name + ", steg " + (i + 1));
      b.setAttribute("aria-pressed", String(on));
      b.onclick = () =>
        edit(() => (current().drums[lane][i] = !current().drums[lane][i]));
      steps.append(b);
    });
    const level = document.createElement("input");
    level.type = "range";
    level.className = "level";
    level.min = 0;
    level.max = 1;
    level.step = 0.01;
    level.value = project.levels[lane];
    level.setAttribute("aria-label", name + " nivå");
    bindRange(
      level,
      () => project.levels[lane],
      (v) => (project.levels[lane] = v),
    );
    row.ondragover = (e) => {
      e.preventDefault();
      row.classList.add("drag");
    };
    row.ondragleave = () => row.classList.remove("drag");
    row.ondrop = (e) => {
      e.preventDefault();
      row.classList.remove("drag");
      if (e.dataTransfer.files[0]) importFiles([e.dataTransfer.files[0]], lane);
    };
    row.append(info, steps, level);
    $("tracks").append(row);
  });
}
function bindRange(input, get, set) {
  let before;
  input.oninput = () => {
    if (before === undefined) before = copy(project);
    set(Number(input.value));
    if (bus && playing)
      bus.gain.setTargetAtTime(project.master, ctx.currentTime, 0.01);
  };
  input.onchange = () => {
    if (before) {
      undoStack.push(before);
      redoStack = [];
      before = undefined;
    } else {
      const value = Number(input.value);
      edit(() => set(value), false);
    }
    renderAll();
  };
}
$("random").onclick = () => {
  edit(() => {
    current().drums = generate(project.style);
  });
  status("Nya kvantiserade trummor i " + patternName(project.selected) + ".");
};
$("style").onchange = (e) => edit(() => (project.style = e.target.value));
$("bpm").onchange = (e) => {
  const value = Number(e.target.value);
  edit(
    () =>
      (project.bpm = Number.isFinite(value)
        ? Math.max(80, Math.min(180, value))
        : 138),
  );
};

function showEditor(piano) {
  $("drum-editor").hidden = piano;
  $("piano-editor").hidden = !piano;
  $("drum-tab").setAttribute("aria-selected", String(!piano));
  $("piano-tab").setAttribute("aria-selected", String(piano));
}
$("drum-tab").onclick = () => showEditor(false);
$("piano-tab").onclick = () => showEditor(true);
function renderPiano() {
  const bass = $("instrument").value === "bass",
    notes = bass ? current().bass : current().melody,
    lengths = bass ? current().bassLengths : current().leadLengths,
    base = Number($("octave").value);
  const el = $("piano");
  el.replaceChildren();
  const ruler = document.createElement("div");
  ruler.className = "piano-row piano-ruler";
  const key = document.createElement("span");
  key.className = "piano-key";
  key.textContent = "1/16";
  ruler.append(key);
  for (let i = 0; i < 16; i++) {
    const n = document.createElement("span");
    n.textContent = i + 1;
    ruler.append(n);
  }
  el.append(ruler);
  for (let pitch = base + 24; pitch >= base; pitch--) {
    const sharp = [1, 3, 6, 8, 10].includes(pitch % 12),
      row = document.createElement("div");
    row.className = "piano-row" + (sharp ? " sharp" : "");
    const key = document.createElement("span");
    key.className = "piano-key" + (sharp ? " black" : "");
    key.textContent = noteName(pitch);
    row.append(key);
    for (let step = 0; step < 16; step++) {
      const b = document.createElement("button");
      const on = notes[step] === pitch;
      b.className =
        "piano-cell" + (on ? " note" : "") + (bass ? " bass-note" : "");
      b.dataset.step = step;
      b.dataset.pitch = pitch;
      b.style.setProperty("--length", Math.min(lengths[step], 16 - step));
      b.setAttribute("aria-label", `${noteName(pitch)}, steg ${step + 1}`);
      b.setAttribute("aria-pressed", String(on));
      b.onclick = () => {
        edit(() => {
          notes[step] = on ? null : pitch;
          lengths[step] = Math.min(Number($("note-length").value), 16 - step);
          if (bass) current().drums[5][step] = !on;
        });
        if (!on) previewNote(pitch, bass);
      };
      b.oncontextmenu = (e) => {
        e.preventDefault();
        edit(() => {
          notes[step] = null;
          if (bass) current().drums[5][step] = false;
        });
      };
      row.append(b);
    }
    el.append(row);
  }
}
async function previewNote(midi, bass) {
  try {
    await audio().resume();
    if (bass)
      trigger(
        ctx,
        previewBus,
        5,
        ctx.currentTime,
        0.45,
        samples[5],
        midi,
        0.18,
      );
    else
      lead(ctx, previewBus, midi, ctx.currentTime, 0.15, 0.4, {
        cutoff: project.cutoff,
        delay: project.delay,
        stepDuration: stepSeconds(project.bpm),
      });
  } catch (e) {
    status("Ljud kunde inte startas: " + e.message);
  }
}
$("instrument").onchange = () => {
  $("octave").value = $("instrument").value === "bass" ? "24" : "60";
  renderPiano();
};
$("octave").onchange = renderPiano;
$("clear-notes").onclick = () =>
  edit(() => {
    if ($("instrument").value === "bass") {
      current().bass.fill(null);
      current().drums[5].fill(false);
    } else current().melody.fill(null);
  });
$("arp").onclick = () => {
  const bass = $("instrument").value === "bass";
  edit(() => {
    const chords = [
      [69, 72, 76, 81],
      [60, 64, 67, 72],
      [65, 69, 72, 77],
      [67, 71, 74, 79],
    ];
    if (bass) {
      current().bass = Array.from(
        { length: 16 },
        (_, i) => [33, 36, 29, 31][Math.floor(i / 4)],
      );
      current().drums[5] = Array.from({ length: 16 }, (_, i) => i % 4 !== 0);
      current().bassLengths.fill(1);
      $("octave").value = "24";
    } else {
      current().melody = Array.from(
        { length: 16 },
        (_, i) => chords[Math.floor(i / 4)][Math.floor(Math.random() * 4)],
      );
      current().leadLengths.fill(1);
    }
  });
  status("Nytt " + (bass ? "basmönster" : "arpeggio") + " i A-moll.");
};
function renderMixer() {
  $("mixer").replaceChildren();
  [...channelNames, "Master"].forEach((name, lane) => {
    const isMaster = lane === 7;
    const strip = document.createElement("div");
    strip.className = "mixer-strip";
    strip.style.setProperty("--color", isMaster ? "#baf27f" : colors[lane]);
    const title = document.createElement("strong");
    title.textContent = name;
    const value = document.createElement("div");
    value.className = "channel-value";
    const level = isMaster ? project.master : project.levels[lane];
    value.textContent =
      level === 0 ? "−∞ dB" : (20 * Math.log10(level)).toFixed(1) + " dB";
    const input = document.createElement("input");
    input.type = "range";
    input.min = 0;
    input.max = 1;
    input.step = 0.01;
    input.value = level;
    input.setAttribute("aria-label", name + " mixernivå");
    bindRange(
      input,
      () => (isMaster ? project.master : project.levels[lane]),
      (v) => {
        if (isMaster) project.master = v;
        else project.levels[lane] = v;
        value.textContent =
          v === 0 ? "−∞ dB" : (20 * Math.log10(v)).toFixed(1) + " dB";
      },
    );
    strip.append(title, value, input);
    if (!isMaster) {
      const buttons = document.createElement("div");
      buttons.className = "mix-buttons";
      for (const [key, label] of [
        ["muted", "M"],
        ["solo", "S"],
      ]) {
        const b = document.createElement("button");
        b.textContent = label;
        b.className = project[key][lane] ? "active" : "";
        b.setAttribute(
          "aria-label",
          (key === "muted" ? "Mute " : "Solo ") + name + " mixer",
        );
        b.setAttribute("aria-pressed", String(project[key][lane]));
        b.onclick = () =>
          edit(() => (project[key][lane] = !project[key][lane]));
        buttons.append(b);
      }
      strip.append(buttons);
    }
    $("mixer").append(strip);
  });
}
bindRange(
  $("cutoff"),
  () => project.cutoff,
  (v) => {
    project.cutoff = v;
    $("cutoff-value").textContent = (v / 1000).toFixed(1) + " kHz";
  },
);
bindRange(
  $("delay"),
  () => project.delay,
  (v) => (project.delay = v),
);

function soundEvents(context, destination, state, events, time, loadedSamples) {
  const step = stepSeconds(state.bpm);
  for (const event of events) {
    const { lane, midi, length } = event;
    if (lane === 6)
      lead(
        context,
        destination,
        midi,
        time,
        step * length,
        state.levels[lane],
        { cutoff: state.cutoff, delay: state.delay, stepDuration: step },
      );
    else
      trigger(
        context,
        destination,
        lane,
        time,
        state.levels[lane],
        loadedSamples[lane],
        midi ?? 33,
        step * length,
      );
  }
}
function updatePosition(absolute) {
  const step = absolute % 16,
    bar = Math.floor(absolute / 16);
  $("position").textContent =
    `${bar + 1}.${Math.floor(step / 4) + 1}.${(step % 4) + 1}`;
  document
    .querySelectorAll(".step")
    .forEach((b) =>
      b.classList.toggle("current", Number(b.dataset.step) === step),
    );
  document
    .querySelectorAll(".piano-cell")
    .forEach((b) =>
      b.classList.toggle("piano-current", Number(b.dataset.step) === step),
    );
  document
    .querySelectorAll("[data-bar]")
    .forEach((b) =>
      b.classList.toggle(
        "playhead",
        mode() === "song" && Number(b.dataset.bar) === bar,
      ),
    );
}
function schedule() {
  if (!playing) return;
  // Recover from a throttled or sleeping window instead of scheduling a burst in the past.
  if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.03;
  while (playing && nextTime < ctx.currentTime + 0.12) {
    if (mode() === "song" && cursor >= project.bars * 16) {
      const token = generation;
      clearInterval(timer);
      setTimeout(
        () => {
          if (generation === token) {
            stop();
            status("Låten är färdigspelad.");
          }
        },
        Math.max(0, (nextTime - ctx.currentTime) * 1000),
      );
      return;
    }
    const absolute = cursor,
      token = generation;
    soundEvents(
      ctx,
      bus,
      project,
      eventsAt(project, absolute, mode()),
      nextTime,
      samples,
    );
    setTimeout(
      () => {
        if (playing && generation === token) {
          playhead = absolute;
          updatePosition(absolute);
        }
      },
      Math.max(0, (nextTime - ctx.currentTime) * 1000),
    );
    nextTime += stepSeconds(project.bpm);
    cursor = mode() === "loop" ? (cursor + 1) % 16 : cursor + 1;
  }
}
function halt(reset = true) {
  playing = false;
  generation++;
  clearInterval(timer);
  if (bus) bus.gain.setValueAtTime(0, ctx.currentTime);
  if (reset) {
    cursor = 0;
    playhead = 0;
    paused = false;
    $("position").textContent = "1.1.1";
  } else {
    cursor = playhead;
    paused = true;
  }
  $("play").textContent = "▶ Spela";
  $("engine").textContent = paused ? "● Pausad" : "● Redo";
  document
    .querySelectorAll(".current,.playhead,.piano-current")
    .forEach((b) => b.classList.remove("current", "playhead", "piano-current"));
}
function stop() {
  halt(true);
}
$("play").onclick = async () => {
  if (playing) {
    halt(false);
    return;
  }
  try {
    await audio().resume();
    if (playing) return;
    if (bus) bus.disconnect();
    bus = master(ctx, project.master);
    if (!paused) cursor = 0;
    paused = false;
    playing = true;
    generation++;
    nextTime = ctx.currentTime + 0.06;
    schedule();
    timer = setInterval(schedule, 25);
    $("play").textContent = "Ⅱ Pausa";
    $("engine").textContent = "● Spelar";
    status(
      mode() === "song"
        ? "Spelar arrangemanget."
        : "Spelar " + patternName(project.selected) + " som loop.",
    );
  } catch (e) {
    status("Kunde inte starta ljud: " + e.message);
  }
};
$("stop").onclick = stop;
$("mode").onchange = () => {
  stop();
  $("export").textContent =
    mode() === "song" ? "↓ Exportera låt" : "↓ Exportera loop";
};

async function importFiles(list, assignLane = null) {
  if (importing) {
    status("Vänta tills den pågående importen är klar.");
    return;
  }
  importing = true;
  try {
    for (const file of list) {
      if (library.length >= 32) throw Error("Ljudbanken rymmer 32 ljud.");
      if (file.size > 40 * 1024 * 1024) throw Error("Max 40 MB per ljud.");
      if (
        library.reduce((n, f) => n + f.bytes.byteLength, 0) + file.size >
        96 * 1024 * 1024
      )
        throw Error("Ljudbanken rymmer totalt 96 MB.");
      const bytes = await file.arrayBuffer();
      const decoded = await audio().decodeAudioData(bytes.slice(0));
      if (decoded.duration > 8)
        throw Error("Välj one-shots på högst 8 sekunder.");
      if (decoded.numberOfChannels > 2)
        throw Error("Välj mono- eller stereoljud.");
      if (
        assignLane !== null &&
        files.reduce(
          (n, f, i) => n + (i === assignLane ? 0 : f?.bytes.byteLength || 0),
          0,
        ) +
          bytes.byteLength >
          96 * 1024 * 1024
      )
        throw Error("Tilldelade ljud får tillsammans vara högst 96 MB.");
      const entry = { name: file.name, bytes, decoded };
      library.push(entry);
      if (assignLane !== null) {
        samples[assignLane] = decoded;
        files[assignLane] = { name: file.name, bytes };
      }
      renderLibrary();
      renderDrums();
      status(
        file.name +
          " importerad" +
          (assignLane === null
            ? " till ljudbanken."
            : " till " + names[assignLane] + "."),
      );
    }
  } catch (e) {
    status("Ljudimport: " + e.message);
  } finally {
    importing = false;
  }
}
function renderLibrary() {
  $("library").replaceChildren();
  if (!library.length) {
    const text = document.createElement("p");
    text.className = "hint";
    text.textContent = "Dina importerade ljud visas här.";
    $("library").append(text);
  }
  library.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "library-item";
    const preview = document.createElement("button");
    preview.textContent = "▶ " + entry.name;
    preview.title = "Provlyssna " + entry.name;
    preview.onclick = async () => {
      try {
        await audio().resume();
        const s = ctx.createBufferSource();
        s.buffer = entry.decoded;
        s.connect(previewBus);
        s.start();
      } catch (e) {
        status("Kunde inte provlyssna: " + e.message);
      }
    };
    const assign = document.createElement("div");
    assign.className = "assign";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Kanal för " + entry.name);
    names.forEach((name, i) => select.add(new Option(name, i)));
    const add = document.createElement("button");
    add.textContent = "Lägg";
    add.onclick = () => {
      const lane = Number(select.value);
      if (
        files.reduce(
          (n, f, i) => n + (i === lane ? 0 : f?.bytes.byteLength || 0),
          0,
        ) +
          entry.bytes.byteLength >
        96 * 1024 * 1024
      ) {
        status("Tilldelade ljud får tillsammans vara högst 96 MB.");
        return;
      }
      files[lane] = { name: entry.name, bytes: entry.bytes };
      samples[lane] = entry.decoded;
      renderDrums();
      renderLibrary();
      status(
        entry.name +
          " till " +
          names[lane] +
          ". Ljudbyten sparas i projektet men ingår inte i ångra-historiken.",
      );
    };
    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.setAttribute(
      "aria-label",
      "Ta bort " + entry.name + " ur ljudbanken",
    );
    remove.onclick = () => {
      library.splice(index, 1);
      renderLibrary();
    };
    assign.append(select, add, remove);
    row.append(preview, assign);
    $("library").append(row);
  });
  // Restore factory sounds without deleting the bank entry.
  if (files.some(Boolean)) {
    const reset = document.createElement("button");
    reset.className = "wide";
    reset.textContent = "Återställ alla synthljud";
    reset.onclick = () => {
      samples.fill(null);
      files.fill(null);
      renderDrums();
      renderLibrary();
      status("Alla kanaler använder inbyggda ljud.");
    };
    $("library").append(reset);
  }
}
$("bank-add").onclick = () => $("bank-input").click();
$("bank-input").onchange = (e) => {
  importFiles([...e.target.files]);
  e.target.value = "";
};
$("sample-input").onchange = (e) => {
  if (e.target.files[0]) importFiles([e.target.files[0]], selectedLane);
  e.target.value = "";
};
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function base64(bytes) {
  const a = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < a.length; i += 8192)
    s += String.fromCharCode(...a.subarray(i, i + 8192));
  return btoa(s);
}
$("save").onclick = () => {
  try {
    const data = {
      ...copy(project),
      files: files.map((f) =>
        f ? { name: f.name, data: base64(f.bytes) } : null,
      ),
    };
    download(
      new Blob([JSON.stringify(data)], { type: "application/json" }),
      "Denax-project.json",
    );
    markSaved();
    status(
      "Projektet sparat: arrangemang, mönster, mixer och tilldelade ljud. Otilldelade bankljud ingår inte.",
    );
  } catch (e) {
    status("Kunde inte spara: " + e.message);
  }
};
$("load").onclick = () => $("project-input").click();
$("project-input").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (importing) {
    status("Vänta tills ljudimporten är klar.");
    return;
  }
  importing = true;
  try {
    if (file.size > 150 * 1024 * 1024)
      throw Error("Projektfilen får vara högst 150 MB.");
    const data = JSON.parse(await file.text());
    const state = migrateProject(data);
    if (!Array.isArray(data.files) || data.files.length !== 6)
      throw Error("Ogiltig ljudlista.");
    const newFiles = [],
      newSamples = [],
      newLibrary = [];
    let total = 0;
    for (const f of data.files) {
      if (!f) {
        newFiles.push(null);
        newSamples.push(null);
        continue;
      }
      if (
        typeof f.name !== "string" ||
        f.name.length > 255 ||
        typeof f.data !== "string" ||
        f.data.length > 56000000
      )
        throw Error("Ogiltigt ljud i projekt.");
      const bytes = Uint8Array.from(atob(f.data), (c) =>
        c.charCodeAt(0),
      ).buffer;
      total += bytes.byteLength;
      if (total > 96 * 1024 * 1024)
        throw Error("Projektets ljud överskrider 96 MB.");
      const decoded = await audio().decodeAudioData(bytes.slice(0));
      if (decoded.duration > 8 || decoded.numberOfChannels > 2)
        throw Error("Projektet innehåller ett ljud som inte stöds.");
      newFiles.push({ name: f.name, bytes });
      newSamples.push(decoded);
      newLibrary.push({ name: f.name, bytes, decoded });
    }
    stop();
    project = state;
    samples = newSamples;
    files = newFiles;
    library = newLibrary;
    undoStack = [];
    redoStack = [];
    markSaved();
    renderAll();
    renderLibrary();
    status("Projekt laddat med arrangemang, mönster, mixer och ljud.");
  } catch (err) {
    status("Kunde inte öppna projekt: " + err.message);
  } finally {
    importing = false;
  }
};
$("export").onclick = async () => {
  if (exporting) return;
  exporting = true;
  $("export").disabled = true;
  try {
    const state = copy(project),
      loadedSamples = samples.slice(),
      exportMode = mode(),
      bars = exportMode === "song" ? state.bars : 4;
    const duration = bars * 16 * stepSeconds(state.bpm);
    const off = new OfflineAudioContext(2, Math.ceil(duration * 48000), 48000),
      dest = master(off, state.master);
    for (let i = 0; i < bars * 16; i++)
      soundEvents(
        off,
        dest,
        state,
        eventsAt(state, exportMode === "loop" ? i % 16 : i, exportMode),
        i * stepSeconds(state.bpm),
        loadedSamples,
      );
    status(`Renderar ${bars} takter…`);
    download(
      wav(await off.startRendering()),
      `Denax-${exportMode}-${state.bpm}bpm.wav`,
    );
    status(
      `WAV exporterad: ${bars} takter, 48 kHz stereo. Ljudsvansar klipps vid slutet.`,
    );
  } catch (e) {
    status("Export misslyckades: " + e.message);
  } finally {
    exporting = false;
    $("export").disabled = false;
  }
};
document.addEventListener("keydown", (e) => {
  const editing = ["INPUT", "SELECT", "TEXTAREA"].includes(
    document.activeElement.tagName,
  );
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
    e.preventDefault();
    $("save").click();
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !editing) {
    e.preventDefault();
    if (e.shiftKey) $("redo").click();
    else $("undo").click();
  }
  if (
    e.code === "Space" &&
    !editing &&
    document.activeElement.tagName !== "BUTTON"
  ) {
    e.preventDefault();
    $("play").click();
  }
});
window.addEventListener("beforeunload", (e) => {
  if (
    JSON.stringify(project) !== savedComposition ||
    files.some((f, i) => f?.bytes !== savedFiles[i])
  ) {
    e.preventDefault();
    e.returnValue = "";
  }
});
renderAll();
renderLibrary();
