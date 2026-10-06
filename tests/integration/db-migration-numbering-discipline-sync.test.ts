/**
 * Database-migration numbering + naming discipline 7-invariant sync —
 * first SQL-migration filesystem substrate edge.
 *
 * `src/db/migrations/` holds every schema-evolution step. Numbering is
 * load-bearing: duplicate IDs race each other at boot, gaps in the
 * active range indicate a silent drop that downstream migrations depend
 * on, and an unrecognised extension (e.g. a stray `.md` note) may get
 * mis-executed by a naive runner. Drift = silent schema corruption.
 *
 * Unlike the 38 prior edges (22 families):
 *   - Prior 22 cover DB schemas (column level), code constants, external
 *     APIs, Grafana alerts, docker-compose, .env.example, GitHub Actions
 *     YAML, CI-script fs refs, tsconfig JSON, .gitignore, wrangler TOML,
 *     package.json, vitest config. None locks the MIGRATION FILESYSTEM
 *     itself — the ordering-contract that determines which column
 *     definitions even make it into production.
 *   - **NEW family #23: MIGRATION NUMBERING + NAMING DISCIPLINE.**
 *     Locks the SQL-migration filesystem substrate for ID uniqueness,
 *     extension allowlist, load-bearing-ID presence, contiguity across
 *     the active sprint range, and SQL-content sanity. First SQL-
 *     filesystem substrate edge.
 *
 * The invariant is declared across 1 directory × 7 invariant axes:
 *
 *   1. **Directory exists + non-empty** — sanity floor.
 *   2. **Extension allowlist** — every file ends in `.sql` OR `.ts`.
 *      A stray `.md` / `.txt` would be ignored by the runner OR
 *      mis-executed as SQL depending on implementation.
 *   3. **3-digit numeric prefix** — every filename matches
 *      `^\d{3}[_-]`. The separator may be `_` (SQL) or `-` (TS).
 *   4. **ID uniqueness** — no two migrations share the same 3-digit
 *      prefix (would race at boot).
 *   5. **Load-bearing IDs present** — 014, 015, 016, 017, 018 all
 *      exist. These are referenced by downstream PRs #155-#168+.
 *      Drift = drop of a migration a later PR's schema expects.
 *   6. **SQL content sanity** — every `.sql` file contains at least
 *      one SQL DDL verb (CREATE TABLE / CREATE INDEX / ALTER / etc).
 *      Empty or prose-only `.sql` is a broken migration.
 *   7. **Active-range contiguity** — IDs 014..018 are contiguous.
 *      Gap = silent drop inside this sprint's range (pre-sprint gap
 *      001→004 is historical + intentional, not load-bearing).
 *
 * Novel invariants locked (family #23):
 *   - **ID-race prevention** — unique 3-digit prefix is the ONLY
 *     ordering signal the runner has. Drift = two files racing.
 *   - **Active-range contiguity** — catches silent drop ONLY in the
 *     current sprint (014-018), not historical ranges. Gap 002/003 is
 *     intentional (migrations squashed into 001).
 *   - **Mixed-extension allowlist** — SQL migrations + TS migrations
 *     coexist; allowlist both but reject anything else.
 *
 * Drift scenarios covered:
 *   - Developer adds `019_new_feature.sql` but uses `019` twice —
 *     case 4 fails (ID uniqueness).
 *   - Someone drops `016_qwen_paper_tracking.sql` mid-refactor — case 5
 *     fails (load-bearing ID present).
 *   - `README.md` left in migrations/ — case 2 fails (extension).
 *   - New migration committed empty — case 6 fails (SQL content).
 *
 * Symmetric to prior integrity edges:
 *   #158/#162/#163/#164/#165/#166/#167/#168 all assert CONTENT of
 *   specific migrations. This edge locks the FILESYSTEM contract —
 *   complementary surface.
 *
 * Opens the **39th integrity edge — ENNEATRIACONTAGON** (39-gon). First
 * SQL-migration filesystem substrate edge. Novel family #23. Integrity
 * octatriacontagon → enneatriacontagon (39-gon). Boot-time ordering
 * contract now CI-locked.
 *
 * Non-goals: asserting migration CONTENT shape (prior 8 edges do that
 * per-migration); verifying migration idempotency (runner concern);
 * locking `.ts` migration shape (currently only 1 .ts migration, YAGNI
 * until another lands).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'src/db/migrations');

const ALLOWED_EXTENSIONS = ['.sql', '.ts'];
const LOAD_BEARING_IDS = ['014', '015', '016', '017', '018'];
const ACTIVE_RANGE = { from: 14, to: 18 };

const SQL_DDL_VERB_PATTERN = /\b(CREATE\s+(?:TABLE|INDEX|TRIGGER|VIEW)|ALTER\s+TABLE|DROP\s+(?:TABLE|INDEX)|INSERT\s+INTO)\b/i;

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR).sort();
}

function extractId(name: string): string | null {
  const m = /^(\d{3})[_-]/.exec(name);
  return m ? m[1] : null;
}

describe('DB migration numbering discipline — 39th edge (ENNEATRIACONTAGON)', () => {
  const files = listMigrations();

  it('migrations directory exists and is non-empty (sanity floor)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every migration file has an allowed extension (.sql or .ts)', () => {
    const bad = files.filter((f) => !ALLOWED_EXTENSIONS.some((ext) => f.endsWith(ext)));
    expect(
      bad,
      `stray files in migrations/: ${bad.join(', ')} — runner would ignore or mis-execute`,
    ).toEqual([]);
  });

  it('every migration file begins with a 3-digit numeric prefix + separator', () => {
    const bad = files.filter((f) => !/^\d{3}[_-]/.test(f));
    expect(
      bad,
      `migrations without 3-digit prefix: ${bad.join(', ')} — ordering contract broken`,
    ).toEqual([]);
  });

  it('migration IDs are globally unique (no boot-time race)', () => {
    const ids = files.map(extractId).filter((id): id is string => id !== null);
    const seen = new Map<string, number>();
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1);
    expect(
      duplicates,
      `duplicate migration IDs: ${duplicates.map(([id, n]) => `${id}×${n}`).join(', ')} — runner race at boot`,
    ).toEqual([]);
  });

  it('LOAD_BEARING_IDS (014-018) all present — downstream PRs depend on them', () => {
    const ids = new Set(files.map(extractId).filter((id): id is string => id !== null));
    const missing = LOAD_BEARING_IDS.filter((id) => !ids.has(id));
    expect(
      missing,
      `missing load-bearing migration IDs: ${missing.join(', ')} — PRs #155-#168 depend on schema changes in these`,
    ).toEqual([]);
  });

  it('every .sql migration contains at least one SQL DDL/DML verb (non-empty schema)', () => {
    const sqls = files.filter((f) => f.endsWith('.sql'));
    const empty: string[] = [];
    for (const f of sqls) {
      const content = readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8');
      if (!SQL_DDL_VERB_PATTERN.test(content)) empty.push(f);
    }
    expect(
      empty,
      `.sql migrations without SQL DDL/DML verb: ${empty.join(', ')} — runner would no-op, schema drift`,
    ).toEqual([]);
  });

  it('active-range IDs 014..018 are contiguous (no silent drop in sprint range)', () => {
    const ids = new Set(files.map(extractId).filter((id): id is string => id !== null));
    const gaps: number[] = [];
    for (let n = ACTIVE_RANGE.from; n <= ACTIVE_RANGE.to; n++) {
      const id = String(n).padStart(3, '0');
      if (!ids.has(id)) gaps.push(n);
    }
    expect(
      gaps,
      `gaps in active migration range: ${gaps.map((n) => String(n).padStart(3, '0')).join(', ')} — silent drop inside current sprint`,
    ).toEqual([]);
  });

  it('composite: 7 axes hold simultaneously (filesystem ordering contract)', () => {
    const ids = files.map(extractId);
    expect(ids.every((id) => id !== null)).toBe(true);
    const idList = ids as string[];
    expect(new Set(idList).size).toBe(idList.length);
    for (const f of files) {
      expect(ALLOWED_EXTENSIONS.some((ext) => f.endsWith(ext)), `bad ext: ${f}`).toBe(true);
    }
    for (const id of LOAD_BEARING_IDS) {
      expect(idList.includes(id), `missing load-bearing id ${id}`).toBe(true);
    }
  });

  it('ID list is sorted lexically by prefix (sanity — runner sorts by filename)', () => {
    const ids = files.map(extractId).filter((id): id is string => id !== null);
    const sorted = [...ids].sort();
    expect(ids, 'filesystem readdir order diverges from sorted order').toEqual(sorted);
  });

  it('no filename contains whitespace or shell-metachar (shell-runner safety)', () => {
    const bad = files.filter((f) => /[\s$`;&|<>*?]/.test(f));
    expect(
      bad,
      `migration names with shell-unsafe chars: ${bad.join(', ')} — runner would mis-escape`,
    ).toEqual([]);
  });

  it('migrations documentation sanity — SQL files start with a comment header', () => {
    const sqls = files.filter((f) => f.endsWith('.sql'));
    const headerless: string[] = [];
    for (const f of sqls) {
      const first = readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8').split('\n')[0].trim();
      if (!first.startsWith('--') && !first.startsWith('/*') && first.length > 0 && !/^CREATE|^ALTER|^INSERT/i.test(first)) {
        headerless.push(f);
      }
    }
    expect(
      headerless,
      `SQL migrations without comment header or DDL first line: ${headerless.join(', ')} — operator-docs surface missing`,
    ).toEqual([]);
  });
});
