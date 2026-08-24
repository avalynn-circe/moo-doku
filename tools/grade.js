/** The logical solver: can this be reasoned out, or does it need guessing? */
const { neighbours } = require('./gen.js');

function makeBoard(n, owner) {
  const rows = [], cols = [], regions = [];
  for (let r = 0; r < n; r++) rows.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) cols.push(Array.from({ length: n }, (_, r) => r * n + c));
  for (let g = 0; g < n; g++) regions.push([]);
  for (let i = 0; i < n * n; i++) regions[owner[i]].push(i);
  return {
    n, owner, rows, cols, regions,
    cand: new Set(Array.from({ length: n * n }, (_, i) => i)),
    placed: [], takenRow: new Set(), takenCol: new Set(), takenReg: new Set(),
  };
}
const copy = b => ({
  ...b, cand: new Set(b.cand), placed: [...b.placed],
  takenRow: new Set(b.takenRow), takenCol: new Set(b.takenCol), takenReg: new Set(b.takenReg),
});
function* groups(b) {
  for (let i = 0; i < b.n; i++) if (!b.takenRow.has(i)) yield b.rows[i];
  for (let i = 0; i < b.n; i++) if (!b.takenCol.has(i)) yield b.cols[i];
  for (let i = 0; i < b.n; i++) if (!b.takenReg.has(i)) yield b.regions[i];
}
const live = (b, g) => g.filter(c => b.cand.has(c));
function put(b, cell) {
  const n = b.n, r = (cell / n) | 0, c = cell % n;
  b.placed.push(cell); b.takenRow.add(r); b.takenCol.add(c); b.takenReg.add(b.owner[cell]);
  for (const x of [...b.cand]) {
    const xr = (x / n) | 0, xc = x % n;
    if (xr === r || xc === c || b.owner[x] === b.owner[cell] ||
        (Math.abs(xr - r) <= 1 && Math.abs(xc - c) <= 1)) b.cand.delete(x);
  }
}
const broken = b => { for (const g of groups(b)) if (!live(b, g).length) return true; return false; };

function forced(b) {
  for (const g of groups(b)) { const l = live(b, g); if (l.length === 1) { put(b, l[0]); return true; } }
  return false;
}
function regionInLine(b) {
  let moved = false;
  for (let gi = 0; gi < b.n; gi++) {
    if (b.takenReg.has(gi)) continue;
    const l = live(b, b.regions[gi]);
    if (!l.length) continue;
    for (const [axis, lines] of [[0, b.rows], [1, b.cols]]) {
      const idx = new Set(l.map(c => axis ? c % b.n : (c / b.n) | 0));
      if (idx.size !== 1) continue;
      const lane = lines[[...idx][0]];
      const extra = live(b, lane).filter(c => b.owner[c] !== gi);
      if (extra.length) { extra.forEach(c => b.cand.delete(c)); moved = true; }
    }
  }
  return moved;
}
function lineInRegion(b) {
  let moved = false;
  for (const [axis, lines, taken] of [[0, b.rows, b.takenRow], [1, b.cols, b.takenCol]]) {
    for (let li = 0; li < b.n; li++) {
      if (taken.has(li)) continue;
      const l = live(b, lines[li]);
      if (!l.length) continue;
      const gs = new Set(l.map(c => b.owner[c]));
      if (gs.size !== 1) continue;
      const gi = [...gs][0];
      const extra = live(b, b.regions[gi]).filter(c => (axis ? c % b.n : (c / b.n) | 0) !== li);
      if (extra.length) { extra.forEach(c => b.cand.delete(c)); moved = true; }
    }
  }
  return moved;
}
function propagate(b, maxTier) {
  for (;;) {
    if (broken(b)) return false;
    if (b.placed.length === b.n) return true;
    if (forced(b)) continue;
    if (maxTier >= 2 && regionInLine(b)) continue;
    if (maxTier >= 3 && lineInRegion(b)) continue;
    return true;
  }
}
function trial(b) {
  for (const x of [...b.cand].sort((p, q) => p - q)) {
    const probe = copy(b);
    put(probe, x);
    if (!propagate(probe, 3)) { b.cand.delete(x); return true; }
  }
  return false;
}
function grade(n, owner) {
  const b = makeBoard(n, owner);
  let hardest = 1, guard = 0, trials = 0;
  while (b.placed.length < n) {
    if (guard++ > 400 || broken(b)) return null;
    if (forced(b)) continue;
    if (regionInLine(b)) { hardest = Math.max(hardest, 2); continue; }
    if (lineInRegion(b)) { hardest = Math.max(hardest, 3); continue; }
    if (trial(b)) { hardest = 4; trials++; continue; }
    return null;
  }
  return { tier: hardest, trials };
}
module.exports = { grade };
