/**
 * Migration prefix integrity test.
 *
 * `src/db/migrations/NNN_name.{sql,ts}` files drive schema evolution. Two
 * PRs merging simultaneously with the same `NNN` prefix would cause the
 * second migration to be silently skipped / mis-applied on deploy.
 *
 * This test asserts:
 *   - every file has a `NNN_` numeric prefix (3 digits, leading zeros)
 *   - no two files share the same `NNN` prefix
 *
 * Gaps in the number sequence are INTENTIONALLY allowed — historical
 * migrations are sometimes squashed or abandoned, and reusing a retired
 * number would silently re-apply on fresh DBs.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { resolve } from 'path';

const MIGRATIONS_DIR = resolve(__dirname, '../../src/db/migrations');

const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(
  (f) => f.endsWith('.sql') || f.endsWith('.ts')
);

describe('Migration prefix integrity — src/db/migrations/', () => {
  it('finds at least 1 migration file (sanity)', () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it('every migration file has a NNN_ numeric prefix (3+ digits)', () => {
    const unprefixed: string[] = [];
    for (const file of migrationFiles) {
      // Accept `001_...` dash form OR `001-...` dash form for backward compat with
      // the legacy TS migration.
      if (!/^(\d{3,})[_-]/.test(file)) {
        unprefixed.push(file);
      }
    }
    expect(
      unprefixed,
      `migrations without NNN_ prefix: ${unprefixed.join(', ')}`
    ).toEqual([]);
  });

  it('no two migrations share the same numeric prefix', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const file of migrationFiles) {
      const m = /^(\d{3,})[_-]/.exec(file);
      if (!m) continue; // handled by prior test
      const prefix = m[1];
      if (seen.has(prefix)) {
        duplicates.push(`prefix ${prefix}: ${seen.get(prefix)} AND ${file}`);
      } else {
        seen.set(prefix, file);
      }
    }
    expect(
      duplicates,
      `duplicate migration prefixes detected — merge race or accidental reuse: ${duplicates.join(' · ')}`
    ).toEqual([]);
  });
});
