#!/usr/bin/env node
/**
 * Fix boundary-crossing imports: desk files importing platform modules,
 * platform files importing desk modules.
 *
 * These cross-boundary imports need the full path: ../../platform/X from desk,
 * or ../../desk/X from platform.
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
  'polymarket','sandbox','wallet','engine','trading-pipeline',
]);
const PLAT_M = new Set([
  'api','auth','billing','marketplace','raas','metering','middleware',
  'audit','dashboard','landing','notifications','persistence',
  'referral','telegram','workers','accounting','analytics','ui',
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

function fixCrossSide(file, fromSide, otherSide, otherModules) {
  const dir = dirname(file);
  let content = readFileSync(file, 'utf8');
  let changed = false;

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
    if (!targetMod || !otherModules.has(targetMod)) continue;

    // Resolve current import — does it resolve to a file?
    const curResolved = resolve(dir, origPath);
    if (existsSync(curResolved) || existsSync(curResolved + '.ts') || existsSync(curResolved + '.js')) {
      continue; // Already works
    }

    // Calculate correct path to other side
    // From desk/X/Y/file.ts to platform/A/B: need to go up to src/, then into platform/
    const sideRoot = fromSide === 'desk' ? DESK : PLATFORM;
    const rel = relative(sideRoot, dir);
    const depthFromSide = rel ? rel.split('/').length : 0;

    // To go from inside desk/XYZ to src/ then platform/: need depthFromSide + 2 levels up
    const levelsUp = depthFromSide + 1;
    const pathViaSrc = '../'.repeat(levelsUp) + otherSide + '/' + parts.slice(dots).join('/');
    const resolvedViaSrc = resolve(dir, pathViaSrc);

    if ((existsSync(resolvedViaSrc) || existsSync(resolvedViaSrc + '.ts') || existsSync(resolvedViaSrc + '.js'))
        && pathViaSrc !== origPath) {
      replacements.push([origPath, pathViaSrc]);
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
// desk files importing platform modules
for (const f of walk(DESK)) { if (fixCrossSide(f, 'desk', 'platform', PLAT_M)) total++; }
// platform files importing desk modules
for (const f of walk(PLATFORM)) { if (fixCrossSide(f, 'platform', 'desk', DESK_M)) total++; }
console.log(`Fixed ${total} boundary-crossing files`);
