#!/usr/bin/env node
/**
 * Phase 3 Import Rewrite Script (v3 — handles vi.mock, dynamic imports)
 *
 * Rewrites imports after moving modules from src/ → src/desk/ or src/platform/.
 *
 * Handles patterns:
 *  - from '...' / from "..."
 *  - vi.mock('...') / vi.mock("...")
 *  - require('...') / require("...")
 *  - import('...') / import("...")
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SRC_ROOT = join(REPO_ROOT, 'src');

// ── Module Assignment Map ──────────────────────────────────────────────

const PLATFORM_MODULES = new Set([
  'api', 'auth', 'billing', 'marketplace', 'raas', 'metering', 'middleware',
  'audit', 'dashboard', 'landing', 'notifications', 'persistence',
  'referral', 'telegram', 'workers',
]);

const DESK_MODULES = new Set([
  'strategies', 'execution', 'signal', 'risk', 'intelligence', 'market-data',
  'arbitrage', 'citadel', 'cli', 'commands', 'core', 'data', 'events',
  'feeds', 'gate', 'interfaces', 'ironclaw', 'jobs', 'markets', 'ml',
  'polymarket', 'sandbox', 'wallet',
]);

const MODULE_SIDE = new Map();
for (const m of PLATFORM_MODULES) MODULE_SIDE.set(m, 'platform');
for (const m of DESK_MODULES) MODULE_SIDE.set(m, 'desk');

// ── File Discovery ─────────────────────────────────────────────────────

function findTsFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory() && entry !== 'node_modules' && !entry.startsWith('.')) {
          results.push(...findTsFiles(full));
        } else if (st.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.mjs') || entry.endsWith('.js'))) {
          results.push(full);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

// ── Path Resolution ────────────────────────────────────────────────────

function resolveRelPath(importPath, fromDir) {
  const relFromDir = fromDir.startsWith(REPO_ROOT)
    ? fromDir.slice(REPO_ROOT.length + 1)
    : fromDir;
  const segments = relFromDir ? relFromDir.split('/').filter(Boolean) : [];
  const importSegments = importPath.split('/');
  for (const seg of importSegments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (segments.length > 0) segments.pop(); continue; }
    segments.push(seg);
  }
  return segments.join('/');
}

// ── Import Path Rewriting ──────────────────────────────────────────────

function getFileSide(filePath) {
  if (filePath.includes('/src/desk/')) return 'desk';
  if (filePath.includes('/src/platform/')) return 'platform';
  return null;
}

function rewriteImportPath(importPath, fromSide, fromFile) {
  if (!importPath.startsWith('.')) return null;
  const fromDir = dirname(fromFile);
  const parts = importPath.split('/');
  let targetModIdx = 0;
  while (targetModIdx < parts.length && (parts[targetModIdx] === '.' || parts[targetModIdx] === '..')) {
    targetModIdx++;
  }
  if (targetModIdx >= parts.length) return null;
  const targetModule = parts[targetModIdx];
  const targetSide = MODULE_SIDE.get(targetModule);

  // Case A: File inside desk/ or platform/
  if (fromSide) {
    if (targetSide === fromSide) return null; // same side siblings
    if (targetSide && targetSide !== fromSide) {
      console.log(`  ⚠ BOUNDARY: ${fromFile} → ${importPath} (${targetSide}→${fromSide})`);
      return null;
    }
    if (!importPath.startsWith('../')) return null; // local ./ import, no change

    const pathAfterDots = importPath.replace(/^(\.\.\/)+/, '');
    // Don't modify imports to sibling files (no subdirectories) —
    // these are same-module files, not external modules.
    if (!pathAfterDots.includes('/')) return null;

    // For __tests__ files: only modify if target is a known src-level module.
    // Otherwise it's a subdirectory of the parent module — don't touch.
    if (fromFile.includes('/__tests__/') && !targetSide) {
      // Check if targetModule directory exists directly under src/
      const modDir = join(SRC_ROOT, targetModule);
      if (!existsSync(modDir)) return null; // not a src-level module, skip
    }

    const resolved = resolveRelPath(importPath, fromDir);
    if (!resolved.startsWith(`src/${fromSide}/`)) return null; // already resolves correctly
    return `../${importPath}`; // needs one more level up
  }

  // Case B: File at src/ level
  if (targetSide) {
    const segments = importPath.split('/');
    const modIdxInSeg = segments.indexOf(targetModule);
    if (modIdxInSeg >= 0) {
      segments[modIdxInSeg] = `${targetSide}/${targetModule}`;
      return segments.join('/');
    }
    return null;
  }

  return null;
}

/**
 * Find and rewrite all import patterns in a file.
 */
function rewriteFileImports(filePath) {
  let content;
  try { content = readFileSync(filePath, 'utf8'); }
  catch { return { changed: false, changes: [] }; }

  const fromSide = getFileSide(filePath);
  const changes = [];

  // Handle: from '...', vi.mock('...'), require('...'), import('...')
  const patterns = [
    /(from\s+['"])(\.[^'"]+)(['"])/g,
    /(vi\.mock\(['"])(\.[^'"]+)(['"])/g,
    /(require\(['"])(\.[^'"]+)(['"])/g,
    /(import\(['"])(\.[^'"]+)(['"])/g,
  ];

  for (const importRe of patterns) {
    let m;
    while ((m = importRe.exec(content)) !== null) {
      const [full, prefix, importPath, suffix] = [m[0], m[1], m[2], m[3]];
      const newPath = rewriteImportPath(importPath, fromSide, filePath);
      if (newPath && newPath !== importPath) {
        content = content.replace(full, `${prefix}${newPath}${suffix}`);
        changes.push({ old: importPath, new: newPath });
      }
    }
  }

  if (changes.length > 0) {
    writeFileSync(filePath, content, 'utf8');
    return { changed: true, changes };
  }
  return { changed: false, changes: [] };
}

// ── Main ───────────────────────────────────────────────────────────────

console.log('Phase 3 Import Rewrite Script (v3)');
console.log('=================================\n');

const allFiles = [
  ...findTsFiles(SRC_ROOT),
  ...findTsFiles(join(REPO_ROOT, 'tests')),
  ...findTsFiles(join(REPO_ROOT, 'scripts')),
];

console.log(`Found ${allFiles.length} files to scan\n`);

let totalChanges = 0, changedFiles = 0;
for (const file of allFiles) {
  const result = rewriteFileImports(file);
  if (result.changed) { changedFiles++; totalChanges += result.changes.length; }
}

console.log(`\nDone: ${changedFiles} files changed, ${totalChanges} import paths updated`);
