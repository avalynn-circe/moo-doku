# Moodoku

Not sudoku. Each board is carved into coloured regions, and you place **one
animal in every row, every column and every region** — with no two animals
touching, not even diagonally.

**Single tap** rules a square out, or clears it. **Double tap** puts an animal
down, and it appears straight away — the first animal on any board is the cow,
then whatever is left, at random, without repeats. Clearing a square returns
its animal to the pool.

A generated level knows nothing about animals; `levels.json` only describes
regions. Which animal appears is decided when the player places it, by the
order of placement rather than by which square was tapped. That is what makes
the sounds predictable and the cow always the first voice you hear.

Expo SDK 57, `expo-dev-client`. 96 levels.

## Running it

    ditto ~/Downloads/lofi-moodoku ~/lofi-moodoku
    cd ~/lofi-moodoku
    npm install          # only if package.json changed
    caffeinate -i npx expo start -c

Build stamp is at the bottom of the screen. Check it before debugging anything.

## Does it need a new dev client?

| module | why |
| --- | --- |
| `expo-audio` | plays the rendered animal voices |
| `@react-native-async-storage/async-storage` | saves the board and progress |

If the dev client already has both, everything here reloads over Metro. If not:

    eas build --profile development --platform android

## Levels

4,000 levels — 1,000 per difficulty, easiest first within each band:

| band | grid | levels | if-then steps needed |
| --- | --- | --- | --- |
| Gentle | 6×6 | 1,000 | 0–19 |
| Steady | 7×7 | 1,000 | 0–25 |
| Tricky | 8×8 | 1,000 | 0–34 |
| Thorny | 9×9 | 1,000 | 0–47 |

The player picks the difficulty from four buttons under the board, all open
from the start, and "next" stays inside whichever they chose. That pairing
matters: without a chooser, a stay-in-band rule means a new player would face a
thousand 6×6 puzzles before ever being handed a 7×7.

A solved level is spent. There is no browsing, no counter and no way back to a
finished puzzle. A band only greys out when all 1,000 of its levels are solved.

Size leads because it is what collapses the search space. A 6×6 has 90
placements satisfying row + column + no-touching; a 9×9 has 47,622.

Regenerating the bank takes under two minutes:

    cd tools && node bank.js 1000 ../src/game/levels.json

The generator was ported from Python to JS and is far faster, which is what
made a bank this size practical. It is also fast enough to make a puzzle on
demand if endless play is ever wanted: measured on a laptop, a full
generate-plus-prove-unique-plus-prove-solvable cycle is 3 ms at 6×6 and 292 ms
at 9×9. Allow 3–5× that on a phone, and run it off the UI thread. Building the
whole 4,000-level bank takes about eight minutes.

Note the RNG. The obvious LCG (`seed * 1103515245`) overflows JS's safe integer
range, loses precision and collapses into a short cycle — it produced 24 unique
levels out of 15,000 attempts. `bank.js` uses mulberry32, which stays in 32-bit
arithmetic.

## Checks

    npm test        # rules + audio
    npm run test:rules  # re-derive all 96 levels through the shipped TypeScript
    npm run test:audio  # replay behaviour, against a fake expo-audio
    npm run purity  # fail if anything in src/game imports React, RN or Expo
    npm run check   # typecheck the whole app

`npm test` re-derives every level through the **shipped TypeScript** rather
than trusting the Python that generated it: legal solution, one per
row/column/region, nothing touching, exactly one answer, contiguous regions,
exactly one cow, a partial board not reading as solved, and clashes flagged.

## Sound

React Native has no WebAudio and `expo-audio` plays files rather than
generating them, so `tools/render-audio.js` synthesises everything offline:

    node tools/render-audio.js     # rewrites assets/audio/*.wav

The nine animal voices are **real recordings**. They are brought in with:

    node tools/ingest-audio.js <source.wav> <name> [startSec] [endSec]

which downmixes to mono, trims to a range if given, shaves silence, fades the
ends so nothing clicks, and matches perceived loudness across the set. That
last part matters: peak-normalising left a rustle and a rooster crow both at
0.85 while one measured six times louder, so the set sounded uneven. It now
targets the 90th percentile of short-window energy and pulls the peak back if
that would clip.

`tools/render-audio.js` makes only the place, clear and win sounds. It
deliberately does **not** touch the animal files — it used to, and running it
would have quietly replaced the recordings with synthesis. The vocal-tract
synthesiser is still in `tools/voice.js` and `tools/animals.js` if it is ever
wanted.

Sound is off until switched on, and the choice is saved. While it is on, the
footer shows how many sounds have played and any failure, so a problem is
visible on the device instead of vanishing.

### The replay bug

`seekTo()` returns a Promise. The first version fired it and called `play()` on
the next line without waiting, so play ran while the seek was still pending and
the player was usually still parked at the end of the clip. The first play of
each sound worked and every replay after it was silent - which is why sound
seemed to work sometimes and mostly not.

Every failure was also swallowed by a bare `catch {}`, so none of it showed up
anywhere. `npm run test:audio` drives the module against a fake expo-audio whose
`seekTo` is genuinely async, and asserts that six consecutive plays all start
from zero. Against the old code, five of the six started at the end.

## Colour

The nine region colours are generated at even spacing in perceptual (LCh)
space, not picked by eye — minimum pairwise distance 19, where below about 10
starts to blur. Light theme only.

Colour is never the only cue: region edges are drawn as thick borders wherever
neighbouring squares belong to different regions, so the board is fully
playable with every colour stripped out.

## Layout

    src/game/      rules, level bank, animals. No React/RN/Expo — enforced.
    src/state/     the React hook, and AsyncStorage
    src/audio/     expo-audio playback of the rendered voices
    src/ui/        board, palette
    tools/         level generator, level verifier, audio renderer

## Not done

- No undo, no hint, and no level picker beyond the ‹ › arrows.
- `assets/audio/goat.wav` is ingested but unused - there is no tenth slot on a
  9x9 board. Metro only bundles what is required, so it costs nothing.
- No win screen. Solving plays the chime and reveals a "next" button; nothing
  else marks the moment.
- Never run on a device. It typechecks, the rules are verified, the audio is
  measured, and Metro bundles it — but nobody has seen or heard it yet.
