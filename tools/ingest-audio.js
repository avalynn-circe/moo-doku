/**
 * Bring a supplied recording into the game's asset folder.
 *
 *   node tools/ingest-audio.js <source.wav> <name> [startSec] [endSec]
 *
 * Downmixes to mono, optionally trims to a range, shaves any silence off the
 * head and tail, applies short fades so nothing clicks, normalises, and writes
 * assets/audio/<name>.wav.
 *
 * Sample rate is left alone - these are short files and resampling only costs
 * quality for no useful saving.
 */
const fs = require('fs');
const path = require('path');

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a RIFF/WAVE file`);
  }
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: b.readUInt16LE(body),
        channels: b.readUInt16LE(body + 2),
        rate: b.readUInt32LE(body + 4),
        bits: b.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = b.subarray(body, body + size);
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${file}: missing fmt or data chunk`);
  if (fmt.format !== 1 || fmt.bits !== 16) {
    throw new Error(`${file}: expected 16-bit PCM, got format ${fmt.format} / ${fmt.bits}-bit`);
  }
  const frames = data.length / 2 / fmt.channels;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) sum += data.readInt16LE((i * fmt.channels + c) * 2);
    out[i] = sum / fmt.channels / 32768;
  }
  return { samples: out, rate: fmt.rate, channels: fmt.channels };
}

function writeWav(file, samples, rate) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(file, b);
  return b.length;
}

/** Drop leading and trailing near-silence. */
function trimSilence(buf, rate, floor = 0.012) {
  let a = 0, b = buf.length - 1;
  while (a < b && Math.abs(buf[a]) < floor) a++;
  while (b > a && Math.abs(buf[b]) < floor) b--;
  a = Math.max(0, a - Math.floor(rate * 0.005));      // leave a touch of air
  b = Math.min(buf.length - 1, b + Math.floor(rate * 0.01));
  return buf.subarray(a, b + 1);
}

function fade(buf, rate, inSec = 0.006, outSec = 0.03) {
  const fi = Math.min(Math.floor(rate * inSec), buf.length >> 1);
  const fo = Math.min(Math.floor(rate * outSec), buf.length >> 1);
  for (let i = 0; i < fi; i++) buf[i] *= i / fi;
  for (let i = 0; i < fo; i++) buf[buf.length - 1 - i] *= i / fo;
  return buf;
}

/**
 * Match perceived loudness, not peak.
 *
 * Peak-normalising made a rustle and a rooster crow both hit 0.85 while one
 * measured six times louder than the other, so the set sounded wildly uneven.
 * Instead, scale so the LOUD PART of each sound lands at the same level - the
 * 90th percentile of short-window energy, which handles a sparse sound like
 * rustling and a dense one like an engine alike - then pull the peak back
 * under the ceiling if that pushed it too far.
 */
function loudness(buf, rate) {
  const win = Math.max(1, Math.floor(rate * 0.05));
  const levels = [];
  for (let i = 0; i + win <= buf.length; i += win) {
    let sum = 0;
    for (let k = 0; k < win; k++) sum += buf[i + k] * buf[i + k];
    levels.push(Math.sqrt(sum / win));
  }
  if (!levels.length) return 0;
  levels.sort((a, b) => a - b);
  return levels[Math.floor(levels.length * 0.9)] || levels[levels.length - 1];
}

function normalize(buf, rate, targetLoud = 0.16, ceiling = 0.95) {
  for (const v of buf) if (!Number.isFinite(v)) throw new Error('non-finite sample in source');
  const loud = loudness(buf, rate);
  if (loud < 1e-5) throw new Error('source is silent');
  let gain = targetLoud / loud;

  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  if (peak * gain > ceiling) gain = ceiling / peak;   // do not clip chasing loudness

  for (let i = 0; i < buf.length; i++) buf[i] *= gain;
  return { gain, loud: loud * gain, peak: peak * gain };
}

function main() {
  const [src, name, startArg, endArg] = process.argv.slice(2);
  if (!src || !name) {
    console.error('usage: node tools/ingest-audio.js <source.wav> <name> [startSec] [endSec]');
    process.exit(1);
  }
  const { samples, rate, channels } = readWav(src);
  const before = samples.length / rate;

  const start = startArg ? Math.floor(Number(startArg) * rate) : 0;
  const end = endArg ? Math.floor(Number(endArg) * rate) : samples.length;
  let buf = Float32Array.from(samples.subarray(start, Math.min(end, samples.length)));

  buf = Float32Array.from(trimSilence(buf, rate));
  fade(buf, rate);
  const lv = normalize(buf, rate);

  const out = path.join(__dirname, '..', 'assets', 'audio', `${name}.wav`);
  const bytes = writeWav(out, buf, rate);
  console.log(
    `${name.padEnd(9)} ${before.toFixed(2)}s -> ${(buf.length / rate).toFixed(2)}s mono  ` +
    `${(bytes / 1024).toFixed(0)} KB  gain x${lv.gain.toFixed(2)}  ` +
    `loudness ${lv.loud.toFixed(3)}  peak ${lv.peak.toFixed(2)}`
  );
}

main();
