/**
 * The farm, as vocal-tract parameters.
 *
 * Each call is built from what actually characterises it acoustically rather
 * than from a generic buzz:
 *
 *   cow      long, low, F0 arching up then down, wide open tract
 *   pig      short nasal grunts - low F1 is what makes it read as "oink" -
 *            with a rough, noisy source, repeated and falling
 *   duck     a fast DOWNWARD formant sweep, very rough. The sweep is the
 *            quack; held still it is just a buzz
 *   sheep    a strong tremolo around 9 Hz over an open "aa" - the bleat
 *   rooster  four segments at different pitches, the last one held and wobbly
 *   horse    pitch falling a long way with a fast amplitude flutter
 *   bee      wingbeat, not a voice: a rough tone modulated near 200 Hz
 *   tractor  an engine, not a voice: slow pulses through a boxy resonance
 *   corn     pure turbulence, no voice at all
 */
const { call, noise, chain, RATE } = require('./voice.js');

const bell = (a, d) => [[0, 0], [a, 1], [1 - d, 0.85], [1, 0]];

const ANIMALS = {
  cow: () => call({
    dur: 1.25,
    f0: [[0, 105], [0.15, 138], [0.5, 145], [1, 92]],
    formants: [
      [[[0, 480], [0.4, 690], [1, 430]], 90, 1.0],
      [[[0, 1050], [0.4, 1280], [1, 980]], 130, 0.6],
      [2600, 200, 0.18],
      [3400, 260, 0.08],
    ],
    amp: [[0, 0], [0.12, 1], [0.72, 0.92], [1, 0]],
    openQ: 0.62, closeQ: 0.2,
    jitter: 0.012, shimmer: 0.05, breath: 0.05,
    vibrato: [5, 0.012],
  }),

  pig: () => {
    const grunt = (f, dur, gain) => call({
      dur,
      f0: [[0, f * 1.12], [0.3, f], [1, f * 0.72]],
      formants: [
        [[[0, 560], [1, 430]], 130, 1.0],     // low F1 - the nasal "oink"
        [[[0, 1280], [1, 920]], 190, 0.55],
        [2500, 300, 0.2],
      ],
      amp: [[0, 0], [0.06, 1], [0.5, 0.8], [1, 0]],
      openQ: 0.4, closeQ: 0.16,
      jitter: 0.05, shimmer: 0.14, breath: 0.22, rough: 0.45,
    });
    return chain([
      { at: 0.00, buf: grunt(270, 0.17), gain: 0.85 },
      { at: 0.21, buf: grunt(240, 0.19), gain: 1.0 },
      { at: 0.45, buf: grunt(205, 0.26), gain: 0.9 },
    ], 0.78);
  },

  duck: () => {
    const quack = (f, dur) => call({
      dur,
      f0: [[0, f], [0.25, f * 0.82], [1, f * 0.5]],
      // the sweep IS the quack
      formants: [
        [[[0, 1150], [0.3, 950], [1, 680]], 200, 1.0],
        [[[0, 2300], [0.3, 1900], [1, 1450]], 280, 0.7],
        [[[0, 3400], [1, 2900]], 400, 0.25],
      ],
      amp: [[0, 0], [0.04, 1], [0.35, 0.7], [1, 0]],
      openQ: 0.35, closeQ: 0.14,
      jitter: 0.07, shimmer: 0.16, breath: 0.28, rough: 0.55,
    });
    return chain([
      { at: 0.00, buf: quack(520, 0.17), gain: 1.0 },
      { at: 0.26, buf: quack(470, 0.2), gain: 0.85 },
    ], 0.52);
  },

  sheep: () => call({
    dur: 0.72,
    f0: [[0, 285], [0.2, 300], [1, 235]],
    formants: [
      [[[0, 820], [0.5, 900], [1, 780]], 110, 1.0],   // open "aa"
      [[[0, 1900], [1, 1750]], 160, 0.62],
      [2900, 250, 0.2],
    ],
    amp: [[0, 0], [0.08, 1], [0.7, 0.9], [1, 0]],
    openQ: 0.5, closeQ: 0.2,
    jitter: 0.03, shimmer: 0.1, breath: 0.1, rough: 0.25,
    vibrato: [9.5, 0.055],                            // the bleat
  }),

  rooster: () => {
    const seg = (f0pts, dur, amp, vib) => call({
      dur, f0: f0pts,
      formants: [
        [[[0, 1150], [1, 1050]], 150, 1.0],
        [[[0, 2350], [1, 2200]], 220, 0.6],
        [3300, 320, 0.22],
      ],
      amp, openQ: 0.42, closeQ: 0.18,
      jitter: 0.035, shimmer: 0.1, breath: 0.14, rough: 0.3,
      vibrato: vib,
    });
    return chain([
      { at: 0.00, buf: seg([[0, 430], [1, 520]], 0.18, bell(0.1, 0.2)) },
      { at: 0.22, buf: seg([[0, 620], [1, 600]], 0.14, bell(0.08, 0.2)) },
      { at: 0.38, buf: seg([[0, 700], [0.3, 730], [1, 690]], 0.2, bell(0.08, 0.2)) },
      { at: 0.60, buf: seg([[0, 640], [0.4, 610], [1, 430]], 0.5, bell(0.06, 0.35), [7, 0.03]) },
    ], 1.15);
  },

  horse: () => call({
    dur: 0.95,
    f0: [[0, 760], [0.2, 620], [0.6, 380], [1, 210]],
    formants: [
      [[[0, 1000], [1, 700]], 160, 1.0],
      [[[0, 2100], [1, 1600]], 240, 0.6],
      [3200, 350, 0.2],
    ],
    amp: [[0, 0], [0.05, 1], [0.75, 0.75], [1, 0]],
    openQ: 0.45, closeQ: 0.18,
    jitter: 0.05, shimmer: 0.22, breath: 0.16, rough: 0.4,
    vibrato: [24, 0.03],                              // the flutter in a whinny
  }),

  bee: () => call({
    dur: 0.75,
    f0: [[0, 205], [0.4, 240], [0.7, 225], [1, 195]],
    formants: [
      [[[0, 420], [1, 380]], 220, 1.0],
      [[[0, 950], [1, 860]], 320, 0.5],
      [1800, 500, 0.18],
    ],
    amp: [[0, 0], [0.12, 1], [0.8, 0.9], [1, 0]],
    openQ: 0.3, closeQ: 0.12,
    jitter: 0.04, shimmer: 0.18, breath: 0.06, rough: 0.2,
  }),

  tractor: () => call({
    dur: 1.0,
    f0: [[0, 26], [0.25, 31], [1, 29]],               // firing rate, not a voice
    formants: [
      [[[0, 120], [1, 135]], 60, 1.0],
      [[[0, 300], [1, 330]], 120, 0.55],
      [720, 260, 0.25],
    ],
    amp: [[0, 0], [0.1, 1], [0.85, 0.95], [1, 0]],
    openQ: 0.2, closeQ: 0.1,
    jitter: 0.03, shimmer: 0.12, breath: 0.1, rough: 0.3,
  }),

  corn: () => noise({
    dur: 0.6,
    formants: [
      [[[0, 3800], [0.5, 5200], [1, 4200]], 1600, 1.0],
      [[[0, 7000], [1, 6200]], 2200, 0.4],
    ],
    amp: [[0, 0], [0.2, 0.8], [0.45, 1], [0.7, 0.6], [1, 0]],
  }),
};

module.exports = { ANIMALS };
