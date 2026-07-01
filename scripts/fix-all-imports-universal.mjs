#!/usr/bin/env node
/**
 * Universal Import Path Fixer — try all reasonable resolutions.
 *
 * For each relative import in src/ and tests/:
 *   1. Resolve as-is → if file exists, skip
 *   2. Try pulling the target out of desk/platform into src/
 *   3. Try pushing into desk/ or platform/
 *   4. Try cross-side (desk↔platform)
 *   5. Try removing .js extension
 *
 * Pick the first resolution that lands on an existing .ts file.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, dirname, relative } from 'path';

const REPO = resolve(import.meta.dirname, '..');
const SRC = join(REPO, 'src');
const DESK = join(SRC, 'desk');
const PLATFORM = join(SRC, 'platform');
const TESTS = join(REPO, 'tests');

function tryExists(base) {
  if (existsSync(base)) return base;
  for (const ext of ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.js']) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

function* resolveAlternatives(file, importPath) {
  const dir = dirname(file);
  const orig = resolve(dir, importPath);

  // 1. As-is
  yield orig;

  // 2. Remove .js extension
  if (importPath.endsWith('.js')) {
    yield resolve(dir, importPath.slice(0, -3));
  }

  // 3. Parse the import: ../../MOD/rest
  const parts = importPath.split('/');
  let dots = 0;
  while (parts[dots] === '..') dots++;
  if (dots === 0) yield orig; // local import, only try as-is
  const modName = parts[dots];
  if (!modName) return;
  const rest = parts.slice(dots + 1).join('/');

  // Try adding desk/ or platform/ prefix between dots and module
  // import: ../../MOD/rest → try: ../../desk/MOD/rest, ../../platform/MOD/rest
  const dotPrefix = '../'.repeat(dots);
  yield resolve(dir, dotPrefix + 'desk/' + modName + (rest ? '/' + rest : ''));
  yield resolve(dir, dotPrefix + 'platform/' + modName + (rest ? '/' + rest : ''));

  // Try removing one ../ level: ../../MOD → ../MOD
  if (dots >= 2) {
    yield resolve(dir, '../'.repeat(dots - 1) + modName + (rest ? '/' + rest : ''));
  }

  // Try adding one ../ level
  yield resolve(dir, '../'.repeat(dots + 1) + modName + (rest ? '/' + rest : ''));

  // Try more aggressive: go up to src/ then try desk/ and platform/
  // Figure out depth from src/
  const relFromSrc = relative(SRC, dir);
  const depthFromSrc = relFromSrc ? relFromSrc.split('/').length : 0;
  if (depthFromSrc > 0) {
    const toSrc = '../'.repeat(depthFromSrc);
    yield resolve(dir, toSrc + modName + (rest ? '/' + rest : ''));
    yield resolve(dir, toSrc + 'desk/' + modName + (rest ? '/' + rest : ''));
    yield resolve(dir, toSrc + 'platform/' + modName + (rest ? '/' + rest : ''));
    yield resolve(dir, toSrc + 'shared/' + modName + (rest ? '/' + rest : ''));
  }
}

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

function fixFile(file) {
  let content = readFileSync(file, 'utf8');
  let changed = false;

  const re = /(?:from\s+['"]|require\s*\(\s*['"]|import\s*\(\s*['"]|vi\.mock\s*\(\s*['"])(\.[^'"]+)['"]/g;
  const replacements = [];

  let m;
  while ((m = re.exec(content)) !== null) {
    const origPath = m[1];
    // Try resolving
    let found = null;
    for (const alt of resolveAlternatives(file, origPath)) {
      found = tryExists(alt);
      if (found) break;
    }
    if (!found) continue; // Can't resolve, leave as-is

    // Calculate the correct relative import path from the file's directory
    const dir = dirname(file);
    let relPath = relative(dir, found);
    if (!relPath.startsWith('.')) relPath = './' + relPath;
    // Remove extension
    relPath = relPath.replace(/\.(ts|tsx|js|mjs)$/, '');

    if (relPath !== origPath) {
      replacements.push([origPath, relPath]);
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
for (const f of [...walk(SRC), ...walk(TESTS)]) {
  if (fixFile(f)) total++;
}
console.log(`Fixed ${total} files`);
