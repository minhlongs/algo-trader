/**
 * Changelog version monotonicity test.
 *
 * `docs/project-changelog.md` is newest-first: each `## [X.Y.Z]` header
 * must be strictly higher (semver) than the next. This test catches:
 *   - accidental version regressions (2.4.10 → 2.4.2 by typo)
 *   - duplicate version entries
 *   - out-of-order entries after git merge
 *
 * Versions are compared as numeric tuples [major, minor, patch]; pre-release
 * / build metadata (`-beta.1`, `+sha`) is NOT supported — deliberate,
 * the project ships plain semver.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CHANGELOG_PATH = resolve(__dirname, '../../docs/project-changelog.md');

interface VersionHeader {
  version: string;
  tuple: [number, number, number];
  line: number;
}

function parseChangelogVersions(): VersionHeader[] {
  const content = readFileSync(CHANGELOG_PATH, 'utf8');
  const lines = content.split('\n');
  const out: VersionHeader[] = [];
  const headerRegex = /^##\s+\[(\d+)\.(\d+)\.(\d+)\]/;
  lines.forEach((line, idx) => {
    const m = headerRegex.exec(line);
    if (m) {
      out.push({
        version: `${m[1]}.${m[2]}.${m[3]}`,
        tuple: [Number(m[1]), Number(m[2]), Number(m[3])],
        line: idx + 1,
      });
    }
  });
  return out;
}

function compareTuple(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

describe('Changelog version monotonicity — docs/project-changelog.md', () => {
  const versions = parseChangelogVersions();

  it('extracts at least 10 version headers (sanity)', () => {
    expect(
      versions.length,
      'parser found <10 version headers — regex stale or file moved'
    ).toBeGreaterThanOrEqual(10);
  });

  it('each version is strictly greater than the next (newest-first order)', () => {
    const violations: string[] = [];
    for (let i = 0; i < versions.length - 1; i++) {
      const cur = versions[i];
      const next = versions[i + 1];
      const cmp = compareTuple(cur.tuple, next.tuple);
      if (cmp <= 0) {
        violations.push(
          `line ${cur.line} [${cur.version}] <= line ${next.line} [${next.version}]`
        );
      }
    }
    expect(
      violations,
      `changelog version order broken: ${violations.join(' · ')}`
    ).toEqual([]);
  });

  it('no duplicate version entries', () => {
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    for (const v of versions) {
      if (seen.has(v.version)) {
        dupes.push(
          `version ${v.version}: line ${seen.get(v.version)} AND line ${v.line}`
        );
      } else {
        seen.set(v.version, v.line);
      }
    }
    expect(dupes, `duplicate version entries: ${dupes.join(' · ')}`).toEqual([]);
  });
});
