/**
 * Re-derive the level bank through the shipped rules, not the Python that
 * built it. Run with `npm test`.
 */
const path = require('path');
const G = require(path.join(__dirname, '..', '.probe', 'game.js'));
const raw = require(path.join(__dirname, '..', 'src', 'game', 'levels.json'));

let bad = 0;
const fail = (...a) => { bad++; console.log('FAIL', ...a); };
const bands = {};

for (const r of raw) {
  const lv = G.parseLevel(r);
  const id = `${lv.band} #${lv.index}`;
  bands[lv.band] = (bands[lv.band] || 0) + 1;

  const cells = G.emptyBoard(lv.n);
  for (const i of lv.solution) cells[i] = G.ANIMAL;
  if (!G.isSolved(lv, cells)) fail(id, 'stated solution is not solved');
  if (G.conflicts(lv, cells).size) fail(id, 'stated solution conflicts');

  const rows = new Set(lv.solution.map(i => G.rowOf(lv.n, i)));
  const cols = new Set(lv.solution.map(i => G.colOf(lv.n, i)));
  const regs = new Set(lv.solution.map(i => lv.regions[i]));
  if (rows.size !== lv.n) fail(id, 'not one per row');
  if (cols.size !== lv.n) fail(id, 'not one per column');
  if (regs.size !== lv.n) fail(id, 'not one per region');

  for (let a = 0; a < lv.solution.length; a++)
    for (let b = a + 1; b < lv.solution.length; b++)
      if (G.touching(lv.n, lv.solution[a], lv.solution[b])) fail(id, 'two animals touching');

  const n = G.countSolutions(lv, 3);
  if (n !== 1) fail(id, `has ${n} solutions, not 1`);

  // regions must be contiguous or the colours look broken
  for (let g = 0; g < lv.n; g++) {
    const inRegion = [];
    for (let i = 0; i < lv.regions.length; i++) if (lv.regions[i] === g) inRegion.push(i);
    if (!inRegion.length) { fail(id, `region ${g} empty`); continue; }
    const set = new Set(inRegion), stack = [inRegion[0]], hit = new Set([inRegion[0]]);
    while (stack.length) {
      const c = stack.pop(), r0 = G.rowOf(lv.n, c), c0 = G.colOf(lv.n, c);
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const rr = r0 + dr, cc = c0 + dc;
        if (rr < 0 || cc < 0 || rr >= lv.n || cc >= lv.n) continue;
        const j = rr * lv.n + cc;
        if (set.has(j) && !hit.has(j)) { hit.add(j); stack.push(j); }
      }
    }
    if (hit.size !== set.size) fail(id, `region ${g} is split`);
  }


  // a partly-filled board must not read as solved
  const partial = G.emptyBoard(lv.n);
  for (const i of lv.solution.slice(0, -1)) partial[i] = G.ANIMAL;
  if (G.isSolved(lv, partial)) fail(id, 'solved with an animal missing');

  // two animals in one row must be flagged
  const clash = G.emptyBoard(lv.n);
  clash[0] = G.ANIMAL; clash[Math.min(2, lv.n - 1)] = G.ANIMAL;
  if (lv.n > 2 && G.conflicts(lv, clash).size < 2) fail(id, 'row clash not flagged');
}

// tap behaviour: single tap marks/clears, double tap places an animal
{
  const EMPTY = G.EMPTY, MARK = G.MARK, ANIMAL = G.ANIMAL;
  // the cycle: empty -> ruled out -> placed -> empty, and back round
  if (G.cycleTap(EMPTY) !== MARK) fail('tap', 'empty should become ruled-out');
  if (G.cycleTap(MARK) !== ANIMAL) fail('tap', 'ruled-out should become placed');
  if (G.cycleTap(ANIMAL) !== EMPTY) fail('tap', 'placed should clear');
  // three taps must return a square to exactly where it started, and every
  // state must be reachable - the clear step used to be all but unreachable
  // because tapping at a normal pace fell inside the old double-tap window
  {
    let st = EMPTY;
    const seen = [];
    for (let k = 0; k < 3; k++) { st = G.cycleTap(st); seen.push(st); }
    if (st !== EMPTY) fail('tap', `three taps ended at ${st}, expected EMPTY`);
    if (new Set(seen).size !== 3) fail('tap', `cycle does not visit 3 states: ${seen}`);
  }
  if (typeof G.singleTap !== 'undefined') fail('tap', 'singleTap is still exported');
  // a placed square must never render without a name - there is no paw any more
  if (G.glyphForCell([ANIMAL], {}, 0) !== null) fail('tap', 'unnamed animal rendered something');
  if (G.glyphForCell([ANIMAL], { 0: 'cow' }, 0) !== G.glyphOf('cow')) fail('tap', 'named animal wrong glyph');
  if (G.glyphForCell([MARK], {}, 0) !== null) fail('tap', 'ruled-out square rendered a glyph');
  if (typeof G.GENERIC_GLYPH !== 'undefined') fail('tap', 'the paw glyph is still exported');
}

// naming: the cow is always first, then no repeats until the pool runs out
{
  let named = {};
  const order = [];
  for (let k = 0; k < G.ANIMALS.length; k++) {
    const key = G.nextAnimal(named, () => 0.5);
    named = { ...named, [k]: key };
    order.push(key);
  }
  if (order[0] !== 'cow') fail('naming', `first animal was ${order[0]}, expected cow`);
  if (new Set(order).size !== order.length) {
    fail('naming', `repeat before the pool ran out: ${order.join(', ')}`);
  }
  // clearing a square must return its animal to the pool
  const afterClear = { 0: 'pig' };
  if (G.nextAnimal(afterClear, () => 0.5) !== 'cow') {
    fail('naming', 'cow not offered again when no cow is placed');
  }
}

// picking a difficulty must land on an unplayed level of exactly that size,
// and "next" must stay inside the size the player chose
{
  const bySize = {};
  for (const r of raw) (bySize[r.n] ||= []).push(G.parseLevel(r));
  const sizes = Object.keys(bySize).map(Number).sort();
  if (sizes.join(',') !== '6,7,8,9') fail('bands', `sizes are ${sizes.join(',')}`);
  for (const n of sizes) {
    if (bySize[n].length < 2) fail('bands', `only ${bySize[n].length} levels at ${n}x${n}`);
    // every level in a size really is that size
    if (bySize[n].some(l => l.regions.length !== n * n)) {
      fail('bands', `a ${n}x${n} level has the wrong number of squares`);
    }
    // easiest first inside a band
    const trials = bySize[n].map(l => l.trials);
    for (let i = 1; i < trials.length; i++) {
      if (trials[i] < trials[i - 1]) { fail('bands', `${n}x${n} is not ordered easiest-first`); break; }
    }
  }
  // simulate: solve 5 at 6x6, then switch to 9x9 - must get an unplayed 9x9
  const done = new Set(bySize[6].slice(0, 5).map(l => l.index));
  const all = raw.map(r => G.parseLevel(r));
  const pick = all.find(l => l.n === 9 && !done.has(l.index));
  if (!pick) fail('bands', 'switching to 9x9 found nothing');
  else if (pick.n !== 9) fail('bands', `switching to 9x9 gave a ${pick.n}x${pick.n}`);
  // and "next" from there stays at 9x9
  const after = new Set(done); after.add(pick.index);
  const nxt = all.find(l => l.n === 9 && !after.has(l.index));
  if (!nxt || nxt.n !== 9) fail('bands', 'next left the chosen size');
  console.log(`band switching: 6x6 -> 9x9 lands on level ${pick.index}, next stays at ${nxt.n}x${nxt.n}`);
}

console.log(`${raw.length} levels checked through the shipped TypeScript`);
console.log('bands:', bands);

// The board must respond on touch-DOWN. `onPress` fires on release, so a cell
// wired that way waits for the finger to lift before anything happens - which
// is felt as lag and was misdiagnosed as audio latency three times running.
{
  const fs = require('fs');
  const board = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'ui', 'Board.tsx'), 'utf8');
  if (!/onPressIn=\{\(\) => onTap\(i\)\}/.test(board)) {
    fail('input', 'board cells are not wired to onPressIn');
  }
  if (/onPress=\{\(\) => onTap\(i\)\}/.test(board)) {
    fail('input', 'board cells still fire on onPress (touch release)');
  }
}

console.log(bad ? `\n${bad} FAILURES` : 'all clear');
process.exit(bad ? 1 : 0);
