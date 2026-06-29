#!/usr/bin/env node
/**
 * Batch 2 Import Fix Script
 * Fixes remaining import paths after moving remaining modules to desk/ and platform/.
 *
 * Strategy:
 * 1. For test files at tests/ level: update src/X → src/desk/X or src/platform/X
 * 2. For files in desk/: fix same-side imports with wrong ../ count
 * 3. For desk→platform boundary crossings: add platform/ prefix
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SRC_ROOT = join(REPO_ROOT, 'src');
const TESTS_ROOT = join(REPO_ROOT, 'tests');

// Modules moved into desk/ and platform/
const DESK_MODULES = new Set([
  'strategies', 'execution', 'signal', 'risk', 'intelligence', 'market-data',
  'arbitrage', 'citadel', 'cli', 'commands', 'core', 'data', 'events',
  'feeds', 'gate', 'interfaces', 'ironclaw', 'jobs', 'markets', 'ml',
  'polymarket', 'sandbox', 'wallet',
]);

const PLATFORM_MODULES = new Set([
  'api', 'auth', 'billing', 'marketplace', 'raas', 'metering', 'middleware',
  'audit', 'dashboard', 'landing', 'notifications', 'persistence',
  'referral', 'telegram', 'workers',
]);

function findTsFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (st.isDirectory() && entry !== 'node_modules' && !entry.startsWith('.')) {
        results.push(...findTsFiles(full));
      } else if (st.isFile() && /\.(ts|tsx|mjs|js)$/.test(entry)) {
        results.push(full);
      }
    } catch { /* skip */ }
  }
  return results;
}

function rewriteImport(content, oldPath, newPath) {
  if (oldPath === newPath) return content;
  let changed = false;
  const patterns = [
    [new RegExp(`(from\\s+['"])${escapeRe(oldPath)}(['"])`, 'g'), `$1${newPath}$2`],
    [new RegExp(`(require\\(['"])${escapeRe(oldPath)}(['"]\\))`, 'g'), `$1${newPath}$2`],
    [new RegExp(`(import\\(['"])${escapeRe(oldPath)}(['"]\\))`, 'g'), `$1${newPath}$2`],
    [new RegExp(`(vi\\.mock\\(['"])${escapeRe(oldPath)}(['"])`, 'g'), `$1${newPath}$2`],
  ];
  for (const [re, replacement] of patterns) {
    if (re.test(content)) {
      content = content.replace(re, replacement);
      changed = true;
    }
  }
  return { content, changed };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}

let totalChanges = 0, changedFiles = 0;

// ── Tests at tests/ level ──────────────────────────────────────────────
const testFiles = findTsFiles(TESTS_ROOT);

for (const file of testFiles) {
  let content = readFileSync(file, 'utf8');
  let fileChanged = false;

  // Fix ../../src/MOD → ../../src/desk/MOD or ../../src/platform/MOD
  for (const mod of DESK_MODULES) {
    const result = rewriteImport(content, `../../src/${mod}/`, `../../src/desk/${mod}/`);
    if (result.changed) { content = result.content; fileChanged = true; }
  }
  for (const mod of PLATFORM_MODULES) {
    const result = rewriteImport(content, `../../src/${mod}/`, `../../src/platform/${mod}/`);
    if (result.changed) { content = result.content; fileChanged = true; }
  }
  // Fix absolute paths like /src/mod/
  for (const mod of DESK_MODULES) {
    const result = rewriteImport(content, `/src/${mod}/`, `../../src/desk/${mod}/`);
    if (result.changed) { content = result.content; fileChanged = true; }
  }
  for (const mod of PLATFORM_MODULES) {
    const result = rewriteImport(content, `/src/${mod}/`, `../../src/platform/${mod}/`);
    if (result.changed) { content = result.content; fileChanged = true; }
  }

  if (fileChanged) { writeFileSync(file, content, 'utf8'); changedFiles++; totalChanges++; }
}

// ── Fix intra-desk imports with wrong ../ count ────────────────────────
// From desk/subdir/file.ts: ../../MOD → ../MOD when MOD is also in desk
// and the resolved path would go outside desk/
const deskFiles = findTsFiles(join(SRC_ROOT, 'desk'));

for (const file of deskFiles) {
  let content = readFileSync(file, 'utf8');
  let fileChanged = false;
  const fromDir = dirname(file);

  // Find all relative imports in the file
  const importRe = /(?:from|require|import|vi\.mock)\s*\(\s*['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const importPath = m[1];
    if (!importPath.startsWith('.')) continue;

    // Resolve the import to an absolute path
    const resolved = resolve(fromDir, importPath);
    // Normalize to repo-relative path
    const relResolved = resolved.slice(REPO_ROOT.length + 1);

    // Check if resolved path exists
    if (existsSync(resolved) || existsSync(resolved + '.ts') || existsSync(resolved + '.js')) {
      continue; // Path resolves correctly
    }

    // If import is ../../X where X is a desk module, try ../X
    const parts = importPath.split('/');
    let dotsUp = 0;
    while (parts[dotsUp] === '..') dotsUp++;
    if (dotsUp === 0) continue;

    const targetMod = parts[dotsUp];
    if (!targetMod) continue;
    if (!DESK_MODULES.has(targetMod)) continue;

    // Calculate correct number of ../ to reach desk/ root
    const deskRoot = join(SRC_ROOT, 'desk');
    const relFromDesk = fromDir.slice(deskRoot.length + 1); // e.g. "strategies/polymarket"
    const depth = relFromDesk ? relFromDesk.split('/').length : 0;

    // To reach desk/ root from this file: need `depth` levels up
    // If currently going up `dotsUp` levels but target needs different count
    const targetDepth = targetMod.split('/').length; // usually 1
    // Correct path: go up `depth` levels to desk/, then down to targetMod
    if (depth > 0 && dotsUp > depth) {
      const newDots = '../'.repeat(depth);
      const newPath = importPath.replace(/^(\.\.\/)+/, newDots);
      if (newPath !== importPath) {
        const newResolved = resolve(fromDir, newPath);
        if (existsSync(newResolved) || existsSync(newResolved + '.ts') || existsSync(newResolved + '.js')) {
          content = content.split(importPath).join(newPath);
          fileChanged = true;
        }
      }
    }
  }

  if (fileChanged) { writeFileSync(file, content, 'utf8'); changedFiles++; }
}

// ── Fix desk→platform boundary crossings ───────────────────────────────
// desk files that import from platform modules need ../platform/ prefix
const deskToPlatformMap = {
  '../persistence/': '../../platform/persistence/',
  '../../persistence/': '../../../platform/persistence/',
  '../audit/': '../../platform/audit/',
  '../../audit/': '../../../platform/audit/',
  '../notifications/': '../../platform/notifications/',
  '../../notifications/': '../../../platform/notifications/',
  '../billing/': '../../platform/billing/',
  '../../billing/': '../../../platform/billing/',
  '../workers/': '../../platform/workers/',
  '../../workers/': '../../../platform/workers/',
  '../dashboard/': '../../platform/dashboard/',
  '../../dashboard/': '../../../platform/dashboard/',
};

for (const file of deskFiles) {
  let content = readFileSync(file, 'utf8');
  let fileChanged = false;

  for (const [oldP, newP] of Object.entries(deskToPlatformMap)) {
    if (content.includes(oldP)) {
      const relPath = file.slice(join(SRC_ROOT, 'desk/').length);
      const depth = relPath.split('/').length - 1; // -1 for filename
      // Re-check: from depth D in desk, ../platform/ needs D+1 levels up
      // If depth=0 (desk/file.ts), then ../../platform/ is correct (desk → src → platform)
      // If depth=1 (desk/strategies/file.ts), then ../../../platform/ is correct
      // But the mapping above assumes specific file positions, let's calculate dynamically

      // Try the new path and see if it resolves
      const fromDir = dirname(file);
      const altResolved = resolve(fromDir, newP);
      if (existsSync(altResolved) || existsSync(altResolved + '.ts')) {
        content = content.split(oldP).join(newP);
        fileChanged = true;
      } else {
        // Try adjusting ../ count
        const targetMod = newP.replace(/^(\.\.\/)+/, '').split('/')[0]; // first non-dot segment should be 'platform'
      }
    }
  }

  if (fileChanged) { writeFileSync(file, content, 'utf8'); changedFiles++; }
}

console.log(`Fixed ${changedFiles} files`);
