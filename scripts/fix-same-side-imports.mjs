#!/usr/bin/env node
/**
 * Fix same-side imports: files in desk/ importing desk modules with wrong ../ count.
 * After `git mv src/X → src/desk/X`, files went 1 level deeper. Imports that were
 * `../Y` (Y in desk) now need `../../Y` if both were at src/ and moved to desk/.
 * And imports that were `../../Y` from deep files may now resolve outside desk/.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, dirname, relative } from 'path';

const REPO = resolve(import.meta.dirname, '..');
const SRC = join(REPO, 'src');
const DESK = join(SRC, 'desk');
const PLATFORM = join(SRC, 'platform');

const DESK_M = new Set([
  'strategies','execution','signal','risk','intelligence','market-data',
  'arbitrage','citadel','cli','commands','core','data','events',
  'feeds','gate','interfaces','ironclaw','jobs','markets','ml',
  'polymarket','sandbox','wallet',
]);
const PLAT_M = new Set([
  'api','auth','billing','marketplace','raas','metering','middleware',
  'audit','dashboard','landing','notifications','persistence',
  'referral','telegram','workers',
]);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    try {
      const s = statSync(p);
      if (s.isDirectory() && e !== 'node_modules' && !e.startsWith('.')) out.push(...walk(p));
      else if (s.isFile() && /\.(ts|tsx|js|mjs)$/.test(e)) out.push(p);
    } catch {}
  }
  return out;
}

function fixFile(file, side, modSet) {
  const dir = dirname(file);
  let content = readFileSync(file, 'utf8');
  let changed = false;

  // Match import paths: from '...', require('...'), vi.mock('...'), import('...')
  const re = /(?:from|require|import|vi\.mock)\s*\(\s*['"](\.[^'"]+)['"]/g;
  const replacements = [];

  let m;
  while ((m = re.exec(content)) !== null) {
    const origPath = m[1];
    const parts = origPath.split('/');
    let dots = 0;
    while (parts[dots] === '..') dots++;
    if (dots === 0) continue;
    const targetMod = parts[dots];
    if (!targetMod || !modSet.has(targetMod)) continue;

    // Calculate correct depth to src/ then into side/
    const sideRoot = side === 'desk' ? DESK : PLATFORM;
    const rel = relative(sideRoot, dir); // e.g. "strategies/polymarket" or ""
    const depthFromSide = rel ? rel.split('/').length : 0;

    // To reach src/ from this file: depthFromSide + 1 (up to side) + 1 (up to src)
    const levelsToSrc = depthFromSide + 2;
    // To reach side/ root from this file: depthFromSide
    const levelsToSide = depthFromSide;

    // Resolve current import
    const curResolved = resolve(dir, origPath);

    // Try the path using levelsToSrc + target (goes through src/)
    const pathViaSrc = '../'.repeat(levelsToSrc) + side + '/' + targetMod;
    const resolvedViaSrc = resolve(dir, pathViaSrc);

    if ((existsSync(resolvedViaSrc) || existsSync(resolvedViaSrc + '.ts') || existsSync(resolvedViaSrc + '.js'))
        && pathViaSrc !== origPath) {
      replacements.push([origPath, pathViaSrc]);
      continue;
    }

    // Try the path using levelsToSide + target (stays within side/)
    if (levelsToSide > 0) {
      const pathViaSide = '../'.repeat(levelsToSide) + targetMod;
      const resolvedViaSide = resolve(dir, pathViaSide);
      if ((existsSync(resolvedViaSide) || existsSync(resolvedViaSide + '.ts') || existsSync(resolvedViaSide + '.js'))
          && pathViaSide !== origPath) {
        replacements.push([origPath, pathViaSide]);
      }
    }
  }

  for (const [old, neu] of replacements) {
    content = content.split(old).join(neu);
    changed = true;
  }

  if (changed) writeFileSync(file, content, 'utf8');
  return changed;
}

let total = 0;
for (const f of walk(DESK)) { if (fixFile(f, 'desk', DESK_M)) total++; }
for (const f of walk(PLATFORM)) { if (fixFile(f, 'platform', PLAT_M)) total++; }
// Also fix tests/ directory
const TESTS = join(REPO, 'tests');
for (const f of walk(TESTS)) {
  let content = readFileSync(f, 'utf8');
  let changed = false;
  // Fix tests: ../../src/X → ../../src/desk/X or ../../src/platform/X
  for (const m of DESK_M) {
    const old = `../../src/${m}/`, neu = `../../src/desk/${m}/`;
    if (content.includes(old)) { content = content.split(old).join(neu); changed = true; }
  }
  for (const m of PLAT_M) {
    const old = `../../src/${m}/`, neu = `../../src/platform/${m}/`;
    if (content.includes(old)) { content = content.split(old).join(neu); changed = true; }
  }
  if (changed) { writeFileSync(f, content, 'utf8'); total++; }
}
console.log(`Fixed ${total} files`);
