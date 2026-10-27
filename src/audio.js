export function trigger(
  ctx,
  dest,
  lane,
  time,
  level,
  sample,
  midi = 33,
  duration = 0.16,
) {
  const gain = ctx.createGain();
  gain.gain.value = level * 0.65;
  gain.connect(dest);
  if (sample) {
    const s = ctx.createBufferSource();
    s.buffer = sample;
    if (lane === 5) s.playbackRate.value = 2 ** ((midi - 33) / 12);
    s.connect(gain);
    s.start(time);
    s.stop(
      time +
        Math.min(
          sample.duration / (lane === 5 ? 2 ** ((midi - 33) / 12) : 1),
          8,
        ),
    );
    return;
  }
  if (lane === 0 || lane === 5) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const o = ctx.createOscillator();
    const e = ctx.createGain();
    o.type = lane === 0 ? "sine" : "sawtooth";
    o.frequency.setValueAtTime(lane === 0 ? 160 : frequency, time);
    o.frequency.exponentialRampToValueAtTime(
      lane === 0 ? 45 : frequency,
      time + 0.12,
    );
    e.gain.setValueAtTime(0.8, time);
    e.gain.exponentialRampToValueAtTime(
      0.001,
      time + (lane === 0 ? 0.45 : Math.max(0.04, duration - 0.01)),
    );
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(lane === 0 ? 1800 : 1000, time);
    f.frequency.exponentialRampToValueAtTime(180, time + 0.16);
    o.connect(f);
    f.connect(e);
    e.connect(gain);
    o.start(time);
    o.stop(time + (lane === 0 ? 0.5 : duration));
    return;
  }
  const noiseDuration = [0, 0.22, 0.055, 0.23, 0.12][lane];
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * noiseDuration),
    ctx.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = lane === 4 ? "bandpass" : "highpass";
  filter.frequency.value = lane === 1 ? 1200 : lane === 4 ? 1800 : 7500;
  const e = ctx.createGain();
  e.gain.setValueAtTime(0.6, time);
  e.gain.exponentialRampToValueAtTime(0.001, time + noiseDuration);
  s.connect(filter);
  filter.connect(e);
  e.connect(gain);
  s.start(time);
  s.stop(time + noiseDuration);
}
export function master(ctx, volume = 0.8) {
  const bus = ctx.createGain();
  bus.gain.value = volume;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 3;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  bus.connect(limiter);
  limiter.connect(ctx.destination);
  return bus;
}
export function wav(buffer) {
  const n = buffer.length;
  const a = new ArrayBuffer(44 + n * 4);
  const v = new DataView(a);
  const str = (offset, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 4, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 2; c++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
      v.setInt16(44 + i * 4 + c * 2, s * (s < 0 ? 32768 : 32767), true);
    }
  return new Blob([a], { type: "audio/wav" });
}
export function lead(ctx, dest, midi, time, duration, level, options = {}) {
  if (level === 0) return;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(
    Math.max(0.000001, level * 0.18),
    time + 0.008,
  );
  env.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.95);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(options.cutoff ?? 4200, time);
  filter.frequency.exponentialRampToValueAtTime(600, time + duration);
  filter.connect(env);
  env.connect(dest);
  const delay = ctx.createDelay(2);
  delay.delayTime.value = (options.stepDuration ?? duration) * 3;
  const wet = ctx.createGain();
  wet.gain.value = options.delay ?? 0.32;
  env.connect(delay);
  delay.connect(wet);
  wet.connect(dest);
  for (const detune of [-9, 0, 9]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    o.detune.value = detune;
    o.connect(filter);
    o.start(time);
    o.stop(time + duration);
  }
}
