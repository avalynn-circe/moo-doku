/**
 * A small vocal-tract synthesiser.
 *
 * The previous attempt filtered a sawtooth through two fixed bandpasses, which
 * makes a distinct noise but never an animal. Three things were missing, and
 * they are what this adds:
 *
 *   1. A glottal pulse source. Vocal folds do not make a sawtooth - they make
 *      a pulse with an open phase, a closing phase and a closed phase. The
 *      shape of that pulse is most of the timbre.
 *   2. Formants that MOVE. A duck's quack is largely a fast downward formant
 *      sweep; held still it just sounds like a buzz.
 *   3. Jitter and shimmer - small random wobbles in pitch and loudness. This
 *      is most of what separates "an animal" from "an oscillator".
 *
 * Formants use Klatt resonators, recalculated per sample so they can glide.
 */
const RATE = 22050;

/** Klatt two-pole resonator, coefficients recomputed as the formant moves. */
class Resonator {
  constructor() { this.y1 = 0; this.y2 = 0; }
  step(x, freq, bw) {
    const r = Math.exp(-Math.PI * bw / RATE);
    const theta = 2 * Math.PI * freq / RATE;
    const b = 2 * r * Math.cos(theta);
    const c = -r * r;
    const a = 1 - b - c;
    const y = a * x + b * this.y1 + c * this.y2;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Interpolate a breakpoint list [[0,v],[0.5,v],[1,v]] at position u (0..1). */
function at(points, u) {
  if (u <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, v0] = points[i], [t1, v1] = points[i + 1];
    if (u >= t0 && u <= t1) {
      const k = t1 === t0 ? 0 : (u - t0) / (t1 - t0);
      return v0 + (v1 - v0) * k;
    }
  }
  return points[points.length - 1][1];
}

/**
 * Rosenberg glottal pulse: rises through the open phase, falls through the
 * closing phase, silent while the folds are shut.
 */
function glottal(phase, openQ, closeQ) {
  if (phase < openQ) {
    const t = phase / openQ;
    return 0.5 * (1 - Math.cos(Math.PI * t));
  }
  if (phase < openQ + closeQ) {
    const t = (phase - openQ) / closeQ;
    return Math.cos(Math.PI * t * 0.5);
  }
  return 0;
}

/**
 * Render one call.
 *
 *   f0      breakpoints for pitch in Hz, over the call
 *   formants array of [freqBreakpoints, bandwidth, gain]
 *   amp     breakpoints for loudness
 *   jitter  pitch wobble, fraction (0.02 = 2%)
 *   shimmer loudness wobble, fraction
 *   breath  how much turbulent noise rides along with the voice
 *   rough   subharmonic content - period doubling, the "creak" in a growl
 */
function call(opts) {
  const dur = opts.dur;
  const n = Math.ceil(dur * RATE);
  const out = new Float32Array(n);
  const res = opts.formants.map(() => new Resonator());
  const noiseRes = new Resonator();

  let phase = 0;
  let jitterWalk = 0;
  let shimmerWalk = 0;
  let flip = 1;

  for (let i = 0; i < n; i++) {
    const u = i / n;

    // pitch, wobbled
    jitterWalk += (Math.random() - 0.5) * 0.35;
    jitterWalk *= 0.92;
    let f0 = at(opts.f0, u) * (1 + jitterWalk * (opts.jitter ?? 0.015));
    if (opts.vibrato) {
      f0 *= 1 + Math.sin(2 * Math.PI * opts.vibrato[0] * (i / RATE)) * opts.vibrato[1];
    }

    // advance the glottal cycle
    const prev = phase;
    phase += f0 / RATE;
    if (phase >= 1) {
      phase -= 1;
      if (opts.rough) flip = -flip;         // period doubling on alternate cycles
    }

    let src = glottal(phase, opts.openQ ?? 0.55, opts.closeQ ?? 0.22);
    if (opts.rough) src *= flip > 0 ? 1 : (1 - opts.rough);

    // turbulent air, shaped by the same tract
    if (opts.breath) src += (Math.random() * 2 - 1) * opts.breath;

    // through the formants, each of which may be gliding
    let voiced = 0;
    for (let k = 0; k < opts.formants.length; k++) {
      const [freqPts, bw, gain] = opts.formants[k];
      const f = Array.isArray(freqPts) ? at(freqPts, u) : freqPts;
      voiced += res[k].step(src, f, bw) * gain;
    }

    // loudness, wobbled
    shimmerWalk += (Math.random() - 0.5) * 0.4;
    shimmerWalk *= 0.9;
    const amp = at(opts.amp, u) * (1 + shimmerWalk * (opts.shimmer ?? 0.05));

    out[i] = voiced * amp;
  }
  return out;
}

/** Pure turbulence - hisses, rustles, snorts. */
function noise(opts) {
  const n = Math.ceil(opts.dur * RATE);
  const out = new Float32Array(n);
  const res = opts.formants.map(() => new Resonator());
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const src = Math.random() * 2 - 1;
    let s = 0;
    for (let k = 0; k < opts.formants.length; k++) {
      const [freqPts, bw, gain] = opts.formants[k];
      const f = Array.isArray(freqPts) ? at(freqPts, u) : freqPts;
      s += res[k].step(src, f, bw) * gain;
    }
    out[i] = s * at(opts.amp, u);
  }
  return out;
}

/** Lay several calls out in time. */
function chain(parts, total) {
  const n = Math.ceil(total * RATE);
  const out = new Float32Array(n);
  for (const { at: startSec, buf, gain = 1 } of parts) {
    const start = Math.floor(startSec * RATE);
    for (let i = 0; i < buf.length && start + i < n; i++) out[start + i] += buf[i] * gain;
  }
  return out;
}

module.exports = { RATE, call, noise, chain, at };
