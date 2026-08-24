/**
 * Exercise the sound layer against a fake expo-audio that behaves like the real
 * one: seekTo is async, and play() while a seek is pending starts from wherever
 * the head currently is. That is the first bug this guards against.
 *
 * The second is the fix for the first turning into LAG. Awaiting the seek on
 * every tap put a native round trip in front of every sound. So the fake's
 * seekTo is deliberately SLOW (30 ms), and the timing test below fails if a
 * tap waits for one. A correctness-only suite passes either way, which is
 * exactly how the lag shipped.
 */
const Module = require('module');
const path = require('path');

let plays = [];      // {key, from} - from is the head position when play() ran
let seeks = 0;
let clock = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class FakePlayer {
  constructor(key) { this.key = String(key); this.pos = 0; this.playing = false; this.duration = 0.2; }
  play() {
    this.playing = true;
    plays.push({ key: this.key, from: this.pos });
    // pretend it runs to the end
    this.pos = this.duration;
  }
  pause() { this.playing = false; }
  async seekTo(sec) {
    // real seeks take a moment - exaggerated here so lag is measurable
    seeks++;
    await new Promise(r => setTimeout(r, 30));
    this.pos = sec;
  }
  remove() {}
}

const fake = {
  createAudioPlayer: (src) => new FakePlayer(String(src)),
  setAudioModeAsync: async () => {},
};

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'expo-audio') return 'expo-audio-FAKE';
  if (request.endsWith('.wav')) return 'wav:' + request;   // Metro turns these into asset ids
  return realResolve.call(this, request, ...rest);
};
const stub = (id, exports) => {
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
stub('expo-audio-FAKE', fake);
for (const n of ['cow','pig','rooster','sheep','duck','horse','tractor','corn','bee','place','clear','win']) {
  stub('wav:../../assets/audio/' + n + '.wav', n);
}

const Sound = require(path.join(__dirname, '..', '..', '.probe-audio', 'sounds.js'));

(async () => {
  let bad = 0;
  const fail = (...a) => { bad++; console.log('FAIL', ...a); };

  await Sound.setEnabled(true);

  // the FIRST play after enabling sound must not wait either. Players load
  //     asynchronously, so an earlier version left them unarmed and paid an
  //     awaited seek on the first tap of each sound - the one tap a player
  //     actually notices. prepare() now warms them all before reporting ready.
  {
    plays = [];
    const t = Date.now();
    await Sound.play('place');
    const first = Date.now() - t;
    console.log(`first play after enabling: ${first}ms`);
    if (first >= 20) fail(`first play waited ${first}ms - players are not pre-warmed`);
    if (plays.length !== 1 || plays[0].from !== 0) fail('first play did not start from 0');
  }

  // 1. a single sound, played repeatedly, must start from 0 EVERY time.
  //    the old code failed here from the second play onward.
  plays = [];
  for (let i = 0; i < 6; i++) await Sound.play('cow');
  console.log(`repeat play: ${plays.length} plays, start positions ${plays.map(p => p.from).join(',')}`);
  if (plays.length !== 6) fail(`expected 6 plays, got ${plays.length}`);
  if (plays.some(p => p.from !== 0)) fail('a replay started from somewhere other than 0');

  // 2. rapid overlapping taps - fire without awaiting, like the UI does
  plays = [];
  await Promise.all(Array.from({ length: 8 }, () => Sound.play('duck')));
  console.log(`rapid taps:  ${plays.length} plays, start positions ${plays.map(p => p.from).join(',')}`);
  if (plays.length !== 8) fail(`expected 8 plays, got ${plays.length}`);
  if (plays.some(p => p.from !== 0)) fail('an overlapping tap started from somewhere other than 0');

  // 3. a tap must not wait on a seek. this is the lag test - a player that has
  //    finished is rewound in the background, so the next tap starts at once.
  await sleep(400);                       // let the background rewinds land
  plays = [];
  let t0 = Date.now();
  await Sound.play('cow');
  const armedMs = Date.now() - t0;
  console.log(`armed play:  ${armedMs}ms (seekTo costs 30ms; must not pay it)`);
  if (armedMs >= 20) fail(`tap waited ${armedMs}ms - it is awaiting a seek again`);
  if (plays.length !== 1 || plays[0].from !== 0) fail('armed play did not start from 0');

  // 4. and when every player in the pool IS busy, correctness still wins over
  //    latency: the slow path seeks, and nothing starts from the end of a clip
  plays = [];
  await Promise.all(Array.from({ length: 12 }, () => Sound.play('cow')));
  console.log(`pool exhausted: ${plays.length} plays, all from 0: ${plays.every(p => p.from === 0)}`);
  if (plays.length !== 12) fail(`expected 12 plays, got ${plays.length}`);
  if (plays.some(p => p.from !== 0)) fail('a play started from the end of the clip');

  // 5. an unknown key must be counted, not silently ignored
  await Sound.play('unicorn');
  if (!Sound.status().includes('failed')) fail('unknown sound was not reported');
  console.log('unknown key:', Sound.status());

  // 4. // every Sound.play(...) key written anywhere in src/ must actually resolve.
  //     Renaming a symbol set leaves dangling keys behind - the audio-toggle
  //     preview still called play('lion') in a game with no lion, and it
  //     survived a bundle grep because Hermes shares substrings ('lion' hides
  //     inside 'RefreshControl' + 'ionDismissing').
  //
  //     The scan takes every string literal inside a play(...) call, not just
  //     play('x') - the tap handler picks its key with a ternary, and an
  //     earlier version of this test silently saw nothing there.
  {
    const fs = require('fs'), pathMod = require('path');
    const root = pathMod.join(__dirname, '..', '..', 'src');
    const files = [];
    (function walk(d) {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const full = pathMod.join(d, f.name);
        if (f.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(f.name)) files.push(full);
      }
    })(root);
    const keys = new Set();
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const call of src.matchAll(/\bplay\(([^)]*)\)/g)) {
        for (const lit of call[1].matchAll(/(['"])([A-Za-z0-9_-]+)\1/g)) keys.add(lit[2]);
      }
    }
    await Sound.setEnabled(true);
    const dangling = [];
    for (const k of keys) {
      plays = [];
      await Sound.play(k);
      if (!plays.length) dangling.push(k);
    }
    console.log(`sound keys in src: ${[...keys].sort().join(', ')}`);
    if (!keys.size) fail('found no sound keys at all - the scan is broken');
    if (dangling.length) fail(`dangling sound key(s): ${dangling.join(', ')}`);
    await Sound.setEnabled(false);
  }

  // the win flourish must not repeat a sound the player just heard. Solving a
  // board means placing a piece, so the piece plays; the flourish 1.9s later
  // used to play it again, which read as a stutter - and in a one-piece game
  // duplicated every single time.
  {
    await Sound.setEnabled(true);
    plays = [];
    await Sound.play('cow');            // as if the winning piece was just placed
    Sound.playWin();
    await sleep(2100);
    const leads = plays.filter(p => p.key === 'cow').length;
    console.log(`win after placing cow: ${plays.map(p => p.key).join(', ')}`);
    if (leads !== 1) fail(`cow played ${leads}x on win, expected 1 (the placement only)`);

    // but when something else was placed last, the flourish still layers
    plays = [];
    await Sound.play('pig');
    Sound.playWin();
    await sleep(2100);
    const layered = plays.filter(p => p.key === 'cow').length;
    console.log(`win after placing pig: ${plays.map(p => p.key).join(', ')}`);
    if (layered !== 1) fail(`flourish did not layer: cow played ${layered}x, expected 1`);
    await Sound.setEnabled(false);
  }

  // 7. disabled means silent
  await Sound.setEnabled(false);
  plays = [];
  await Sound.play('cow');
  if (plays.length) fail('played while disabled');
  console.log('while disabled:', plays.length, 'plays');

  console.log(bad ? `\n${bad} FAILURES` : '\nall clear');
  process.exit(bad ? 1 : 0);
})();
