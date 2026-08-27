import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))) out.push(f);
  }
  return out;
};

const cur = new Map();
for (const f of walk('src')) {
  const p = f.split('\\').join('/');
  cur.set(p, readFileSync(f, 'utf-8').split('\n').length);
}

const b = await import('./quality-baseline.json', { with: { type: 'json' } });
const snap = b.default.quality.oversizedFileBaseline.violators;
console.log('snapshot keys:', Object.keys(snap).length, 'count field:', b.default.quality.oversizedFileBaseline.count);
console.log('current >200:', [...cur.values()].filter(n => n > 200).length);

const inSnapNotCur = [], inCurNotSnap = [], grown = [], shrunk = [];
for (const [p, n] of Object.entries(snap)) {
  if (!cur.has(p)) inSnapNotCur.push(p);
  else {
    const c = cur.get(p);
    if (c > n) grown.push({ p, from: n, to: c });
    if (c <= 200) shrunk.push(p);
  }
}
for (const [p, n] of cur) {
  if (n > 200 && !snap[p]) inCurNotSnap.push(p);
}

console.log('in snapshot but not in tree:', inSnapNotCur.length, inSnapNotCur.slice(0, 10));
console.log('grown (now bigger):', grown.length, JSON.stringify(grown.slice(0, 10)));
console.log('shrunk to <=200:', shrunk.length, shrunk.slice(0, 10));
console.log('current >200 NOT in snapshot:', inCurNotSnap.length, inCurNotSnap.slice(0, 15));