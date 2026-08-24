/**
 * The level generator, ported to JS, to answer one question: can a phone make
 * a puzzle on demand?
 *
 * Same algorithm as the Python: pick a placement, carve regions around it,
 * then tighten the regions until exactly one solution survives, then check it
 * can be reasoned out rather than guessed.
 */
function neighbours(n, cell, out) {
  out.length = 0;
  const r = (cell / n) | 0, c = cell % n;
  if (r > 0) out.push(cell - n);
  if (r < n - 1) out.push(cell + n);
  if (c > 0) out.push(cell - 1);
  if (c < n - 1) out.push(cell + 1);
  return out;
}
const touching = (n, a, b) =>
  Math.abs(((a / n) | 0) - ((b / n) | 0)) <= 1 && Math.abs((a % n) - (b % n)) <= 1;

function placement(n, rnd) {
  for (let t = 0; t < 4000; t++) {
    const cols = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    let ok = true;
    for (let i = 0; i < n - 1; i++) if (Math.abs(cols[i] - cols[i + 1]) < 2) { ok = false; break; }
    if (ok) return cols;
  }
  return null;
}

function growRegions(n, queens, rnd, stretch) {
  const owner = new Int8Array(n * n).fill(-1);
  const axis = Array.from({ length: n }, () => (rnd() * 2) | 0);
  const frontier = [], sizes = new Int16Array(n);
  const nb = [];
  for (let i = 0; i < n; i++) {
    owner[queens[i]] = i; sizes[i] = 1;
    frontier.push(neighbours(n, queens[i], []).filter(q => owner[q] === -1));
  }
  let left = n * n - n;
  let guard = 0;
  while (left > 0 && guard++ < n * n * 8) {
    let pick = -1, best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!frontier[i].some(c => owner[c] === -1)) continue;
      const score = sizes[i] + rnd();
      if (score < best) { best = score; pick = i; }
    }
    if (pick < 0) break;
    const opts = frontier[pick].filter(c => owner[c] === -1);
    frontier[pick] = opts;
    if (!opts.length) continue;
    let cell;
    if (stretch && rnd() < stretch) {
      const want = axis[pick] ? queens[pick] % n : (queens[pick] / n) | 0;
      const inline = opts.filter(c => (axis[pick] ? c % n : (c / n) | 0) === want);
      const from = inline.length ? inline : opts;
      cell = from[(rnd() * from.length) | 0];
    } else {
      cell = opts[(rnd() * opts.length) | 0];
    }
    owner[cell] = pick; sizes[pick]++; left--;
    frontier[pick] = frontier[pick].filter(c => c !== cell);
    for (const q of neighbours(n, cell, nb)) if (owner[q] === -1) frontier[pick].push(q);
  }
  for (let c = 0; c < n * n; c++) {
    if (owner[c] !== -1) continue;
    const near = neighbours(n, c, nb).map(q => owner[q]).filter(o => o !== -1);
    if (!near.length) return null;
    owner[c] = near[0];
  }
  return owner;
}

function solutions(n, owner, limit) {
  const found = [];
  const acc = new Int16Array(n);
  (function walk(row, prev, cols, regs) {
    if (found.length >= limit) return;
    if (row === n) { found.push(Array.from(acc)); return; }
    for (let c = 0; c < n; c++) {
      const bit = 1 << c;
      if (cols & bit) continue;
      if (prev >= 0 && Math.abs(prev - c) < 2) continue;
      const g = owner[row * n + c], rbit = 1 << g;
      if (regs & rbit) continue;
      acc[row] = row * n + c;
      walk(row + 1, c, cols | bit, regs | rbit);
      if (found.length >= limit) return;
    }
  })(0, -1, 0, 0);
  return found;
}

function contiguous(n, owner, gi, without) {
  const cells = [];
  for (let c = 0; c < n * n; c++) if (owner[c] === gi && c !== without) cells.push(c);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), stack = [cells[0]], nb = [];
  const inRegion = new Set(cells);
  while (stack.length) {
    for (const q of neighbours(n, stack.pop(), nb)) {
      if (inRegion.has(q) && !seen.has(q)) { seen.add(q); stack.push(q); }
    }
  }
  return seen.size === cells.length;
}

function refine(n, owner, queens, rnd, rounds = 140, sample = 30) {
  owner = Int8Array.from(owner);
  const qset = new Set(queens);
  const nb = [];
  for (let r = 0; r < rounds; r++) {
    const sols = solutions(n, owner, sample);
    if (sols.length <= 1) return sols.length === 1 ? owner : null;
    const tally = new Map();
    for (const sol of sols) {
      if (sol.every(c => qset.has(c))) continue;
      for (const c of sol) if (!qset.has(c)) tally.set(c, (tally.get(c) || 0) + 1);
    }
    if (!tally.size) return owner;
    const ranked = [...tally.keys()].sort((a, b) => tally.get(b) - tally.get(a) || rnd() - 0.5);
    let moved = false;
    for (const x of ranked) {
      const g = owner[x];
      const others = [...new Set(neighbours(n, x, nb).map(q => owner[q]))].filter(o => o !== g);
      for (const g2 of others) {
        owner[x] = g2;
        if (contiguous(n, owner, g)) { moved = true; break; }
        owner[x] = g;
      }
      if (moved) break;
    }
    if (!moved) return null;
  }
  return null;
}
module.exports = { placement, growRegions, refine, solutions, contiguous, neighbours, touching };
