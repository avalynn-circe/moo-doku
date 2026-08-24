/**
 * Moodoku rules and board state.
 *
 * Deliberately free of React and React Native imports so it compiles straight
 * to CommonJS and can be exercised in Node:
 *
 *   npx tsc src/game/game.ts --outDir /tmp/probe --module commonjs \
 *     --target es2020 --skipLibCheck
 *
 * Keep it that way - it is what makes the rules testable without a device.
 */

export type Cell = 0 | 1 | 2;
export const EMPTY: Cell = 0;
export const MARK: Cell = 1;   // player's "definitely not here"
export const ANIMAL: Cell = 2;

export interface RawLevel {
  n: number;
  band: string;
  r: string;    // region id per cell, row-major, one digit each
  q: string;    // comma-separated solution cells
  trials: number;
  steps: number;
  i: number;
}

export interface Level {
  n: number;
  band: string;
  index: number;
  regions: number[];
  solution: number[];
  /** how much if-then reasoning the level needs; 0 means forced moves only */
  trials: number;
}

export function parseLevel(raw: RawLevel): Level {
  const regions = raw.r.split('').map(Number);
  const solution = raw.q.split(',').map(Number);
  if (regions.length !== raw.n * raw.n) {
    throw new Error(`level ${raw.i}: expected ${raw.n * raw.n} cells, got ${regions.length}`);
  }
  if (solution.length !== raw.n) {
    throw new Error(`level ${raw.i}: expected ${raw.n} animals, got ${solution.length}`);
  }
  return { n: raw.n, band: raw.band, index: raw.i, regions, solution, trials: raw.trials };
}

export const emptyBoard = (n: number): Cell[] => new Array(n * n).fill(EMPTY) as Cell[];

export const rowOf = (n: number, i: number) => Math.floor(i / n);
export const colOf = (n: number, i: number) => i % n;

export function touching(n: number, a: number, b: number): boolean {
  return Math.abs(rowOf(n, a) - rowOf(n, b)) <= 1 &&
         Math.abs(colOf(n, a) - colOf(n, b)) <= 1;
}

/** Cells holding an animal that breaks a rule. Empty set means legal so far. */
export function conflicts(level: Level, cells: Cell[]): Set<number> {
  const { n, regions } = level;
  const placed: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === ANIMAL) placed.push(i);
  const bad = new Set<number>();
  for (let a = 0; a < placed.length; a++) {
    for (let b = a + 1; b < placed.length; b++) {
      const x = placed[a], y = placed[b];
      if (rowOf(n, x) === rowOf(n, y) ||
          colOf(n, x) === colOf(n, y) ||
          regions[x] === regions[y] ||
          touching(n, x, y)) {
        bad.add(x);
        bad.add(y);
      }
    }
  }
  return bad;
}

export function isSolved(level: Level, cells: Cell[]): boolean {
  const placed: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === ANIMAL) placed.push(i);
  return placed.length === level.n && conflicts(level, cells).size === 0;
}

/**
 * Count solutions up to `limit`, row by row. Not used in the running game -
 * the bank is pre-verified - but it lets the bank be re-checked in Node
 * rather than trusted.
 */
export function countSolutions(level: Level, limit = 2): number {
  const { n, regions } = level;
  let found = 0;
  const walk = (row: number, prev: number, colsUsed: number, regsUsed: number): void => {
    if (found >= limit) return;
    if (row === n) { found++; return; }
    for (let c = 0; c < n; c++) {
      const bit = 1 << c;
      if (colsUsed & bit) continue;
      if (prev >= 0 && Math.abs(prev - c) < 2) continue;
      const g = regions[row * n + c];
      const rbit = 1 << g;
      if (regsUsed & rbit) continue;
      walk(row + 1, c, colsUsed | bit, regsUsed | rbit);
      if (found >= limit) return;
    }
  };
  walk(0, -1, 0, 0);
  return found;
}

/** A correct cell the player has not found yet, for the hint button. */
export function hintCell(level: Level, cells: Cell[]): number | null {
  const missing = level.solution.filter(i => cells[i] !== ANIMAL);
  return missing.length ? missing[0] : null;
}

/**
 * One tap, cycling: empty -> ruled out -> placed -> empty.
 *
 * This replaced a double-tap. Double-tap needed a 300 ms window, which meant
 * either the first tap was withheld until the window closed (every tap felt
 * laggy) or it was applied and then undone by the second (the board flickered,
 * and a tap-to-clear that landed inside the window silently became a place
 * instead). It also made the clear step nearly unreachable: clearing a ruled-out
 * square is a single tap, but anyone tapping at a normal pace hit the double
 * window and got a piece.
 *
 * A cycle has no timing at all. Every tap advances one step, so nothing depends
 * on how fast the player taps and every step is reachable.
 */
export function cycleTap(state: Cell): Cell {
  if (state === EMPTY) return MARK;
  if (state === MARK) return ANIMAL;
  return EMPTY;
}

/** Squares ruled out by the animals already placed - drives auto-marking. */
export function ruledOut(level: Level, cells: Cell[]): Set<number> {
  const { n, regions } = level;
  const out = new Set<number>();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== ANIMAL) continue;
    for (let j = 0; j < cells.length; j++) {
      if (j === i || cells[j] === ANIMAL) continue;
      if (rowOf(n, j) === rowOf(n, i) ||
          colOf(n, j) === colOf(n, i) ||
          regions[j] === regions[i] ||
          touching(n, i, j)) {
        out.add(j);
      }
    }
  }
  return out;
}

/**
 * The animals.
 *
 * Nothing in the level data mentions an animal - a generated puzzle only knows
 * about regions. Which animal appears is decided when the player puts one
 * down: the first on any board is the cow, and the rest are drawn at random
 * from what is left, without repeats. Clearing a square returns its animal to
 * the pool.
 */

export const ANIMALS = [
  { key: 'cow',     glyph: '\u{1F404}' },
  { key: 'pig',     glyph: '\u{1F416}' },
  { key: 'rooster', glyph: '\u{1F413}' },
  { key: 'sheep',   glyph: '\u{1F411}' },
  { key: 'duck',    glyph: '\u{1F986}' },
  { key: 'horse',   glyph: '\u{1F40E}' },
  { key: 'tractor', glyph: '\u{1F69C}' },
  { key: 'corn',    glyph: '\u{1F33D}' },
  { key: 'bee',     glyph: '\u{1F41D}' },
] as const;

export type AnimalKey = typeof ANIMALS[number]['key'];

export const COW: AnimalKey = 'cow';

export const glyphOf = (key: AnimalKey): string =>
  ANIMALS.find(a => a.key === key)?.glyph ?? ANIMALS[0].glyph;

/** Which squares have been given a particular animal. */
export type Named = Record<number, AnimalKey>;

/**
 * Pick the animal for the next square to be named. The cow goes first on every
 * board; after that it is whatever is still unused, at random. If every animal
 * is somehow already out, it starts round again.
 */
export function nextAnimal(named: Named, rand: () => number = Math.random): AnimalKey {
  const used = new Set(Object.values(named));
  if (!used.has(COW)) return COW;
  const free = ANIMALS.map(a => a.key).filter(k => !used.has(k));
  const pool = free.length ? free : ANIMALS.map(a => a.key).filter(k => k !== COW);
  return pool[Math.floor(rand() * pool.length)] as AnimalKey;
}

/** What a square should show, if anything. */
export function glyphForCell(cells: Cell[], named: Named, i: number): string | null {
  if (cells[i] !== ANIMAL) return null;
  const key = named[i];
  return key ? glyphOf(key) : null;
}
