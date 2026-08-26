/**
 * Static quality checks — pure Node, no shell, no catch.
 *
 * Replaces the grep pipelines behind Gate 8 checks 3a (`: any` types),
 * 3b (console.log/warn/error calls) and 3d (banned imports). Two reasons:
 *   1. grep exits 1 on zero matches, which the old catch→PASS('N/A')
 *      swallowed as a false PASS. An fs walk + regex never errors on zero
 *      matches: zero hits = count 0 = legitimate PASS 0.
 *   2. Local `grep` is ugrep while CI uses GNU grep — `\b` word-boundary
 *      semantics differ. JS regex `\b` is identical to GNU grep's for
 *      ASCII and deterministic everywhere.
 *
 * Counting semantics (must match `grep -r <pattern> | wc -l` exactly):
 *   - Count LINES matching the regex, not occurrences (grep emits one
 *     output line per matching file-line; a line with two matches on it
 *     counts once for 3a/3b).
 *   - 3d sums, per banned import, the lines containing that literal — a
 *     line with two different banned imports counts 2 (same as the old
 *     per-import grep loop). Banned entries match as plain string
 *     literals via String.includes.
 *   - Walk is recursive over `${rootDir}/src`, .ts/.tsx only, symlinks
 *     skipped (entry.isFile() is false for symlinks — matches `grep -r`,
 *     which does not follow symlinks).
 *
 * Errors throw — the caller (check-quality-baseline.mjs checks 3a/3b/3d)
 * fails loud instead of recording a false PASS.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Recursively walk `${rootDir}/src` for .ts/.tsx files and return
 * `[{ path, content }]` sorted by repo-relative path (posix separators).
 * Symlinks are skipped. Throws if the src/ subdir is missing (fail loud).
 */
export function collectSourceFiles(rootDir) {
  const srcDir = join(rootDir, 'src');
  if (!statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`collectSourceFiles: src directory not found at ${srcDir}`);
  }

  const results = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        results.push({
          path: relative(rootDir, full).split('\\').join('/'),
          content: readFileSync(full, 'utf-8'),
        });
      }
    }
  };
  walk(srcDir);

  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

/**
 * Count lines matching `regex` across all files (grep|wc -l semantics:
 * one count per matching file-line, regardless of matches per line).
 *
 * @param {Array<{ path: string, content: string }>} files
 * @param {RegExp} regex
 * @returns {number}
 */
export function countPatternLines(files, regex) {
  let count = 0;
  for (const file of files) {
    for (const line of file.content.split('\n')) {
      if (regex.test(line)) count += 1;
    }
  }
  return count;
}

/**
 * Count banned-import lines: for each banned literal, the number of lines
 * containing it, summed (a line with two different banned imports counts
 * twice — same as the old per-import grep loop).
 *
 * @param {Array<{ path: string, content: string }>} files
 * @param {string[]} bannedImports plain string literals (matched via includes)
 * @returns {number}
 */
export function countBannedImports(files, bannedImports) {
  let count = 0;
  for (const banned of bannedImports) {
    for (const file of files) {
      for (const line of file.content.split('\n')) {
        if (line.includes(banned)) count += 1;
      }
    }
  }
  return count;
}
