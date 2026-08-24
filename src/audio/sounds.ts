import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * Sound.
 *
 * The nine animal voices are real recordings brought in with
 * tools/ingest-audio.js; place, clear and win are synthesised by
 * tools/render-audio.js.
 *
 * Two things here exist because of a bug where sounds mostly did not play:
 *
 *   1. `seekTo()` returns a Promise. The first version fired it and called
 *      play() on the next line without waiting, so play() ran while the seek
 *      was still pending and the player was usually still sitting at the end
 *      of the clip - silence. Every replay after the first failed. The seek is
 *      now awaited.
 *
 *   2. Every failure was swallowed by a bare `catch {}`, so none of that was
 *      visible on a device. Failures are now counted and the last one kept,
 *      and `status()` surfaces them in the footer.
 *
 * Each sound gets a small pool of players used round-robin, so tapping quickly
 * does not leave a second tap fighting the first one's pending seek.
 *
 * The awaited seek in (1) then showed up as LATENCY: every tap paid a native
 * round trip before any sound came out, which was reported as lag on the place
 * tone. Awaiting it is only necessary because the player is parked at the end
 * of its last play. So players are now rewound on RELEASE rather than on
 * acquire - after a clip finishes, its player seeks back to 0 in the background
 * and is marked armed. A tap takes an armed player and calls play() with
 * nothing to await.
 *
 * The fallback path still awaits, for the case where every player in a pool is
 * mid-flight. That keeps the guarantee from (1) - a play never starts from the
 * end of the clip - while the common tap pays nothing for it.
 *
 * The background rewind is scheduled for after the clip ENDS. Seeking a player
 * that is still playing would restart the sound mid-flight, which is the
 * obvious-looking version of this and is wrong.
 */
const SOURCES: Record<string, number> = {
  cow: require('../../assets/audio/cow.wav'),
  pig: require('../../assets/audio/pig.wav'),
  rooster: require('../../assets/audio/rooster.wav'),
  sheep: require('../../assets/audio/sheep.wav'),
  duck: require('../../assets/audio/duck.wav'),
  horse: require('../../assets/audio/horse.wav'),
  tractor: require('../../assets/audio/tractor.wav'),
  corn: require('../../assets/audio/corn.wav'),
  bee: require('../../assets/audio/bee.wav'),
  place: require('../../assets/audio/place.wav'),
  clear: require('../../assets/audio/clear.wav'),
  win: require('../../assets/audio/win.wav'),
};

/**
 * Players are allocated per sound, not a flat pool per sound.
 *
 * A flat pool of 4 across 12 sounds meant 48 native AudioPlayer instances,
 * which Android does not hand out happily - sounds simply stopped playing.
 * Only the tap ticks ever overlap themselves; a win chime never does.
 */
const POOL_FOR: Record<string, number> = { place: 3, clear: 3, win: 1 };
const DEFAULT_POOL = 2;
const poolSize = (key: string): number => POOL_FOR[key] ?? DEFAULT_POOL;

let pools: Record<string, AudioPlayer[]> = {};
let turn: Record<string, number> = {};
/** Per player: rewound to 0 and idle, so play() can start it with no await. */
let armed: Record<string, boolean[]> = {};
let ready = false;
let preparing: Promise<void> | null = null;
let enabled = false;
let winTimer: ReturnType<typeof setTimeout> | null = null;

/** When each key last actually started, so the win flourish can avoid
 *  repeating a sound the player only just heard. */
let lastKeyAt: Record<string, number> = {};

let played = 0;
let failed = 0;
let lastError = '';

export function status(): string {
  if (!enabled) return 'sound off';
  if (!ready) return lastError ? `sound failed: ${lastError}` : 'sound loading';
  // Only failures are worth a player's screen space. The success count was
  // developer diagnostics that shipped by accident and read as gibberish.
  return failed ? `sound: ${failed} failed (${lastError})` : '';
}

export const isEnabled = () => enabled;

async function prepare(): Promise<void> {
  if (ready) return;
  if (preparing) return preparing;
  preparing = (async () => {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',   // short effects, do not grab focus
      });
      const next: Record<string, AudioPlayer[]> = {};
      for (const [key, src] of Object.entries(SOURCES)) {
        const n = poolSize(key);
        next[key] = Array.from({ length: n }, () => createAudioPlayer(src));
        turn[key] = 0;
        armed[key] = Array.from({ length: n }, () => false);
      }
      // Warm every player before declaring ready.
      //
      // createAudioPlayer loads asynchronously, and play() on a player that has
      // not finished loading is silent. A previous version handled that by
      // leaving players unarmed so the FIRST play of each sound took the
      // awaited-seek path - which fixed the silence by moving the cost onto the
      // very first tap, the one place a player actually notices it.
      //
      // Seeking each player to 0 here forces the load and leaves the head in
      // the right place, so the first tap is as cheap as every other tap. This
      // runs when sound is switched on, not during play.
      await Promise.allSettled(
        Object.entries(next).flatMap(([key, players]) =>
          players.map((pl, i) =>
            Promise.resolve(pl.seekTo(0)).then(() => { armed[key][i] = true; }),
          ),
        ),
      );

      pools = next;
      ready = true;
      lastError = '';
    } catch (e) {
      ready = false;
      lastError = e instanceof Error ? e.message : String(e);
    } finally {
      preparing = null;
    }
  })();
  return preparing;
}

export async function setEnabled(on: boolean): Promise<void> {
  enabled = on;
  if (on) await prepare();
}

/**
 * Play one sound. Fire and forget - callers do not await. The seek IS awaited
 * internally, which is the whole point.
 */
export async function play(key: string): Promise<void> {
  if (!enabled) return;
  if (!ready) {
    await prepare();
    if (!ready) return;
  }
  const pool = pools[key];
  if (!pool || !pool.length) {
    failed++;
    lastError = `no player for ${key}`;
    return;
  }

  // prefer a player that is already rewound - it can start on this tick
  let i = -1;
  for (let k = 1; k <= pool.length; k++) {
    const c = (turn[key] + k) % pool.length;
    if (armed[key]?.[c]) { i = c; break; }
  }
  const mustSeek = i < 0;
  if (mustSeek) i = (turn[key] + 1) % pool.length;
  turn[key] = i;

  const player = pool[i];
  if (armed[key]) armed[key][i] = false;
  try {
    if (player.playing) player.pause();
    if (mustSeek) await player.seekTo(0);   // every player busy: pay the round trip
    player.play();
    lastKeyAt[key] = Date.now();
    played++;
    rearm(key, i, player);
  } catch (e) {
    failed++;
    lastError = `${key}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Rewind a player once its clip has finished, so the next tap needs no seek. */
function rearm(key: string, i: number, player: AudioPlayer): void {
  // A rewind must land AFTER the clip ends. `duration` can still be 0 while the
  // asset loads, and the old `|| 1` turned that into a 1-second timer - which
  // seeked the 3.4s win chime back to its start mid-play and swallowed it. When
  // the duration is not known yet, wait longer than any clip here rather than
  // shorter: the cost is one extra awaited seek, not a lost sound.
  const known = Number(player.duration);
  const ms = Math.ceil((known > 0.05 ? known : 4) * 1000) + 80;
  setTimeout(() => {
    Promise.resolve(player.seekTo(0)).then(
      () => { if (armed[key]) armed[key][i] = true; },
      () => { /* leave it unarmed; the slow path will seek it */ },
    );
  }, ms);
}

/**
 * Finishing a board: the chime, with a cow over its tail.
 *
 * The follow-up is skipped when the player has just heard that same sound.
 * Completing a board means placing a piece, which plays that piece - so the
 * flourish landing 1.9s later read as the same noise twice rather than as a
 * layer. In a one-piece game (LotusDoku) it ALWAYS duplicated.
 *
 * This keeps the layering where it works - in MooDoku the cow goes down first
 * and is long past by the time a board is solved - and drops it where it only
 * sounds like a stutter.
 */
export function playWin(): void {
  if (!enabled) return;
  void play('win');
  if (winTimer) clearTimeout(winTimer);
  winTimer = setTimeout(() => {
    if (Date.now() - (lastKeyAt['cow'] ?? 0) > 2000) void play('cow');
  }, 1900);
}

export function release(): void {
  if (winTimer) { clearTimeout(winTimer); winTimer = null; }
  for (const pool of Object.values(pools)) {
    for (const p of pool) { try { p.remove(); } catch {} }
  }
  pools = {}; turn = {}; ready = false;
}
