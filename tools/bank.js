/**
 * Build the level bank.
 *
 * Ported from tools/generate_levels.py, which took 126s for 96 levels. This
 * does the same work far faster, which is what makes a big bank practical.
 *
 *   node bank.js <perBand> <outfile>
 */
const fs = require('fs');
const G = require('./gen.js');
const { grade } = require('./grade.js');

const BANDS = [[6, 'Gentle'], [7, 'Steady'], [8, 'Tricky'], [9, 'Thorny']];

/**
 * mulberry32. The obvious LCG is wrong in JS: seed * 1103515245 blows past
 * 2^53, so the multiply loses precision and the sequence collapses. That gave
 * 24 unique levels out of 15,000 attempts. This stays in 32-bit arithmetic.
 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(Number(process.env.SEED || 20260824));

function makeOne(n) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const cols = G.placement(n, rnd);
    if (!cols) continue;
    const queens = cols.map((c, r) => r * n + c);
    const owner = G.growRegions(n, queens, rnd, [0, 0.4, 0.8][(rnd() * 3) | 0]);
    if (!owner) continue;
    const refined = G.refine(n, owner, queens, rnd);
    if (!refined) continue;
    if (G.solutions(n, refined, 2).length !== 1) continue;
    const g = grade(n, refined);
    if (!g) continue;
    return {
      n, r: Array.from(refined).join(''),
      q: queens.join(','),
      trials: g.trials, steps: g.tier,
    };
  }
  return null;
}

const perBand = Number(process.argv[2] || 250);
const out = process.argv[3] || 'levels.json';
const levels = [];
const t0 = Date.now();

for (const [n, band] of BANDS) {
  const seen = new Set(), got = [];
  const bandStart = Date.now();
  let attempts = 0;
  while (got.length < perBand && attempts < perBand * 60) {
    attempts++;
    const lv = makeOne(n);
    if (!lv || seen.has(lv.r)) continue;
    seen.add(lv.r);
    got.push({ ...lv, band });
  }
  // easiest first inside a band: fewest if-then steps needed
  got.sort((a, b) => a.trials - b.trials);
  got.forEach((lv, i) => { lv.i = levels.length + i; });
  levels.push(...got);
  const tr = got.map(l => l.trials);
  console.log(`${n}x${n} ${band.padEnd(7)} ${String(got.length).padStart(4)} levels  ` +
              `trials ${Math.min(...tr)}-${Math.max(...tr)}  ` +
              `${((Date.now() - bandStart) / 1000).toFixed(0)}s`);
}

fs.writeFileSync(out, JSON.stringify(levels));
console.log(`\n${levels.length} levels in ${((Date.now() - t0) / 1000).toFixed(0)}s, ` +
            `${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
