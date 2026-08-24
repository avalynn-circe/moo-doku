/**
 * Render the game's NON-ANIMAL sounds to WAV files.
 *
 * The nine animal voices are real recordings, brought in with
 * tools/ingest-audio.js. This script deliberately does not touch them - it
 * used to, and running it would have silently replaced them with synthesis.
 * The vocal-tract engine that produced those earlier attempts is still in
 * voice.js and animals.js if it is ever wanted again.
 *
 * React Native has no WebAudio, and expo-audio plays files rather than
 * generating them, so the synthesis happens here and ships as assets.
 *
 * Every animal is one parameterised voice: a pitch contour through two formant
 * bandpasses, optionally roughened with noise. Only the numbers differ.
 *
 *   node tools/render-audio.js
 */
const fs = require('fs');
const path = require('path');

const RATE = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'audio');
const midi = m => 440 * Math.pow(2, (m - 69) / 12);

function normalize(buf, target) {
  let peak = 0;
  for (const v of buf) {
    if (!Number.isFinite(v)) throw new Error('NaN or Infinity in the buffer');
    peak = Math.max(peak, Math.abs(v));
  }
  if (peak < 1e-6) throw new Error('refusing to write a silent file');
  for (let i = 0; i < buf.length; i++) buf[i] *= target / peak;
  return buf;
}

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT, name), buf);
  return { name, seconds: (n / RATE).toFixed(2), kb: (buf.length / 1024).toFixed(0) };
}

const bandpass = (buf, f, q) => {
  // two-pole bandpass, the same shape the browser's biquad had
  const w = 2 * Math.PI * f / RATE, a = Math.sin(w) / (2 * q), c = Math.cos(w);
  const b0 = a, b2 = -a, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = (b0 / a0) * x0 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0; out[i] = y0;
  }
  return out;
};

/** One creature call. Same parameter shape as the browser version. */
function voice(p) {
  const n = Math.ceil(p.dur * RATE);
  const raw = new Float32Array(n);
  const pts = p.glide || [[0, 1], [1, 1]];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, frac = t / p.dur;
    let mul = pts[pts.length - 1][1];
    for (let k = 0; k < pts.length - 1; k++) {
      if (frac >= pts[k][0] && frac <= pts[k + 1][0]) {
        const span = pts[k + 1][0] - pts[k][0] || 1;
        const u = (frac - pts[k][0]) / span;
        mul = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u;
        break;
      }
    }
    let s = 0;
    if (p.f0) {
      let f = p.f0 * mul;
      if (p.vib) f += Math.sin(2 * Math.PI * p.vib[0] * t) * p.vib[1];
      phase += f / RATE;
      const ph = phase % 1;
      s += p.wave === 'square' ? (ph < 0.5 ? 1 : -1)
         : p.wave === 'sine' ? Math.sin(2 * Math.PI * phase)
         : p.wave === 'triangle' ? 2 * Math.abs(2 * ph - 1) - 1
         : 2 * ph - 1;                                   // sawtooth
    }
    if (p.noise) s += (Math.random() * 2 - 1) * p.noise;
    raw[i] = s;
  }
  const forms = p.form || [700, 1500];
  const shaped = new Float32Array(n);
  forms.forEach((f, k) => {
    const band = bandpass(raw, f, p.q || 5);
    const w = k === 0 ? 1 : 0.5;
    for (let i = 0; i < n; i++) shaped[i] += band[i] * w;
  });
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const attack = p.attack || 0.03;
    const env = t < attack ? t / attack
              : t > p.dur * 0.72 ? Math.max(0, 1 - (t - p.dur * 0.72) / (p.dur * 0.28))
              : 1;
    shaped[i] *= env;
  }
  return shaped;
}

/** Several calls in a row - oinks, clucks, plods. */
function sequence(parts, total) {
  const n = Math.ceil(total * RATE);
  const buf = new Float32Array(n);
  let at = 0;
  for (const [p, gap] of parts) {
    const v = voice(p);
    const start = Math.floor(at * RATE);
    for (let i = 0; i < v.length && start + i < n; i++) buf[start + i] += v[i];
    at += gap;
  }
  return buf;
}

/** Finishing a board: a rising figure landing on a chord, then the cow. */
function win() {
  const dur = 3.4, n = Math.ceil(dur * RATE);
  const buf = new Float32Array(n);
  const bell = (startSec, note, gain, decay) => {
    const f = midi(note), start = Math.floor(startSec * RATE);
    for (let i = 0; start + i < n; i++) {
      const t = i / RATE;
      let s = 0, alive = false;
      for (const [mul, amp, d] of [[1, 1, decay], [2.01, .48, decay * 1.7], [2.99, .26, decay * 2.4]]) {
        const env = Math.exp(-t * d);
        if (env < 0.0004) continue;
        alive = true;
        s += Math.sin(2 * Math.PI * f * mul * t) * amp * env;
      }
      if (!alive && t > 0.05) break;
      buf[start + i] += s * (t < 0.008 ? t / 0.008 : 1) * gain;
    }
  };
  [69, 72, 76, 79, 81].forEach((note, k) => bell(k * 0.115, note, k === 4 ? 0.5 : 0.34, 2.6));
  [57, 64, 69, 72, 76].forEach((note, k) => bell(0.6 + k * 0.02, note, 0.26 / Math.sqrt(k + 1), 1.1));
  // the real cow gets the last word instead - see playWinThenCow in sounds.ts
  const fade = Math.floor(0.08 * RATE);
  for (let i = 0; i < fade; i++) buf[n - 1 - i] *= i / fade;
  return normalize(buf, 0.85);
}

/**
 * Placing and clearing a square.
 *
 * The clear tone used to start at 420 Hz and glide DOWN to about 330. On a
 * laptop that is a perfectly good "undo" gesture. On a phone it was reported as
 * no sound at all, and the measurement agrees: a phone speaker is a couple of
 * centimetres across and barely moves air below 300 Hz, so a tone sweeping
 * towards 330 arrives somewhere between faint and absent.
 *
 * The gesture is what carries the meaning, not the absolute pitch - so it still
 * sweeps downward, just an octave and a bit higher where the speaker works.
 * Keep both tones above ~700 Hz at their LOWEST point, not their highest.
 */
function tick(up) {
  const dur = 0.18, n = Math.ceil(dur * RATE);
  const buf = new Float32Array(n);
  const f = up ? 880 : 1150;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = t < 0.006 ? t / 0.006 : Math.exp(-(t - 0.006) * 26);
    // instantaneous frequency is f*(1 - 2*k*t); k = 0.6 sweeps 1150 -> 750 Hz
    buf[i] = Math.sin(2 * Math.PI * f * t * (up ? 1 : 1 - t * 0.6)) * env;
  }
  return normalize(buf, 0.42);
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const made = [];
made.push(writeWav('place.wav', tick(true)));
made.push(writeWav('clear.wav', tick(false)));
made.push(writeWav('win.wav', win()));
let total = 0;
for (const m of made) { total += Number(m.kb); console.log(`  ${m.name.padEnd(12)} ${m.seconds}s  ${m.kb} KB`); }
console.log(`${made.length} files, ${(total / 1024).toFixed(1)} MB`);
