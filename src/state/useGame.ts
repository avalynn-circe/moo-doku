import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ANIMAL, EMPTY, MARK, conflicts as findConflicts, emptyBoard,
  isSolved, nextAnimal, parseLevel, cycleTap,
  type Cell, type Level, type Named, type RawLevel,
} from '../game/game';
import rawLevels from '../game/levels.json';
import { emptyProgress, load, save, type Progress } from './storage';
import * as Sound from '../audio/sounds';

export const LEVELS: Level[] = (rawLevels as RawLevel[]).map(parseLevel);
export const LEVEL_COUNT = LEVELS.length;

/** The four sizes, in the order they are offered. */
export const BANDS = [
  { band: 'Gentle', n: 6 },
  { band: 'Steady', n: 7 },
  { band: 'Tricky', n: 8 },
  { band: 'Thorny', n: 9 },
] as const;

export function useGame() {
  const progress = useRef<Progress>(emptyProgress());
  const [index, setIndex] = useState(0);
  const [cells, setCells] = useState<Cell[]>(() => emptyBoard(LEVELS[0].n));
  const [sound, setSound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [named, setNamed] = useState<Named>({});

  const level = LEVELS[index];
  const clashes = useMemo(() => findConflicts(level, cells), [level, cells]);
  const solved = useMemo(() => isSolved(level, cells), [level, cells]);
  const placed = useMemo(() => cells.filter(c => c === ANIMAL).length, [cells]);

  const persist = useCallback((patch: Partial<Progress>) => {
    progress.current = { ...progress.current, ...patch };
    void save(progress.current);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const p = await load();
      if (!live) return;
      progress.current = p;
      const n = Math.min(Math.max(p.level, 0), LEVEL_COUNT - 1);
      setIndex(n);
      setCells((p.boards[n] as Cell[]) ?? emptyBoard(LEVELS[n].n));
      setNamed(p.named?.[n] ?? {});
      setDone(new Set(p.done));
      setSound(p.sound);
      if (p.sound) void Sound.setEnabled(true);
      setLoaded(true);
    })();
    return () => { live = false; };
  }, []);

  // remember a solved board once, when it lands
  useEffect(() => {
    if (!loaded || !solved || done.has(index)) return;
    Sound.playWin();
    const next = new Set(done); next.add(index);
    setDone(next);
    persist({ done: [...next] });
  }, [solved, loaded, index, done, persist]);

  /**
   * One tap advances the square: empty -> ruled out -> placed -> empty.
   *
   * No timers, no "was this a double?" - see cycleTap in game.ts for why the
   * double-tap went away. Each step has its own sound, which is also what makes
   * the clear tone reachable; under the old scheme almost every attempt to
   * clear a square landed inside the double-tap window and placed a piece.
   */
  const tap = useCallback((i: number) => {
    const before = cells[i];
    const after = cycleTap(before);
    const next = cells.slice();
    next[i] = after;
    setCells(next);

    let nextNamed = named;
    if (after === ANIMAL) {
      nextNamed = { ...named, [i]: nextAnimal(named) };
      Sound.play(nextNamed[i]);
    } else {
      if (named[i]) {
        nextNamed = { ...named };
        delete nextNamed[i];
      }
      Sound.play(after === MARK ? 'place' : 'clear');
    }
    setNamed(nextNamed);

    persist({
      boards: { ...progress.current.boards, [index]: next },
      named: { ...progress.current.named, [index]: nextNamed },
    });
  }, [cells, named, index, persist]);

  const reset = useCallback(() => {
    const fresh = emptyBoard(level.n);
    setCells(fresh);
    setNamed({});
    Sound.play('clear');
    persist({
      boards: { ...progress.current.boards, [index]: fresh },
      named: { ...progress.current.named, [index]: {} },
    });
  }, [level.n, index, persist]);

  /** Move to a specific level. Used on load; players do not browse. */
  const goTo = useCallback((i: number) => {
    const n = ((i % LEVEL_COUNT) + LEVEL_COUNT) % LEVEL_COUNT;
    setIndex(n);
    setCells((progress.current.boards[n] as Cell[]) ?? emptyBoard(LEVELS[n].n));
    setNamed(progress.current.named?.[n] ?? {});
    persist({ level: n });
  }, [persist]);

  /**
   * The next unplayed level at the chosen size. Solved levels are spent, and
   * the size only changes when the player changes it - finishing 250 Gentle
   * puzzles should not be the price of seeing a 9x9.
   */
  const nextUnplayed = useCallback(() => {
    const spent = new Set(done);
    spent.add(index);
    const here = LEVELS[index].n;
    const pick = LEVELS.find(l => l.n === here && !spent.has(l.index));
    if (!pick) return false;               // this size is used up
    goTo(pick.index);
    return true;
  }, [done, index, goTo]);

  /** Switch size. Picks up wherever that size was left off. */
  const chooseBand = useCallback((n: number) => {
    if (LEVELS[index].n === n) return true;
    const pick = LEVELS.find(l => l.n === n && !done.has(l.index));
    if (!pick) return false;               // that size is used up
    goTo(pick.index);
    return true;
  }, [done, index, goTo]);

  /** How many are left at each size, so the chooser can show what is spent. */
  const leftInBand = useMemo(() => {
    const out: Record<number, number> = {};
    for (const b of BANDS) {
      out[b.n] = LEVELS.filter(l => l.n === b.n && !done.has(l.index)).length;
    }
    return out;
  }, [done]);

  const toggleSound = useCallback(() => {
    const next = !sound;
    setSound(next);
    void Sound.setEnabled(next);
    persist({ sound: next });
    if (next) Sound.play('cow');
    return next;
  }, [sound, persist]);

  return {
    level, index, cells, named, clashes, solved, placed, sound, loaded, done,
    remaining: LEVEL_COUNT - done.size,
    leftInBand,
    actions: { tap, reset, goTo, toggleSound, chooseBand, next: nextUnplayed },
  };
}
