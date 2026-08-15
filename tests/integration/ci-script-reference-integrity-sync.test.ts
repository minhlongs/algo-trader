/**
 * CI script-file reference integrity 5-invariant sync.
 *
 * `.github/workflows/ci.yml` references several custom scripts (e.g.,
 * `scripts/ci-gate-secret-scan.mjs`, `scripts/ci-gate-paper-gate-lock.sh`).
 * Each `run: node scripts/X.mjs` or `run: bash scripts/X.sh` invocation
 * requires the target file to exist on disk at build-time — if missing,
 * CI step fails with opaque "No such file or directory" error.
 *
 * Beyond existence, each script needs schema-completeness: `.mjs` files
 * should have Node-ESM shape (import/export or shebang); `.sh` files
 * need bash shebang + be non-empty. Gate 7 (shellcheck) further requires
 * `.sh` files pass shellcheck — this edge asserts shellcheck-compatible
 * shape (bash shebang + executable bit hint).
 *
 * Unlike the 32 prior edges (16 families):
 *   - Prior 16 families cover DB schemas, code constants, external APIs,
 *     Grafana alerts, docker-compose, `.env.example` operator docs,
 *     GitHub Actions workflow schema.
 *   - **NEW family #17: CI-REFERENCED SCRIPT FILE REFERENCE INTEGRITY.**
 *     Locks the contract between `.github/workflows/*.yml` `run:` step
 *     references to `scripts/X.Y` AND the actual file tree. Distinct
 *     from #175 (CI workflow YAML schema) because this locks the
 *     EXTERNAL-FILE dependency graph from CI steps, not the workflow
 *     YAML itself.
 *
 * The invariant is declared across 2 surfaces × multiple axes:
 *
 *   1. **CI workflow `run:` steps** — `.github/workflows/ci.yml`
 *      invokes 4 scripts today:
 *        - `scripts/ci-gate-secret-scan.mjs` (Gate 2)
 *        - `scripts/ci-gate-deploy-smoke.mjs` (Gate 5)
 *        - `scripts/ci-gate-paper-gate-lock.sh` (Gate 6)
 *        - `scripts/validate-strategies.mjs` (Gate 1)
 *   2. **`scripts/` file tree** — actual `.mjs`/`.sh`/`.js` files on disk.
 *
 * Novel invariants locked (family #17):
 *   - **Existence coherence** — every `scripts/X.Y` CI reference resolves
 *     to an actual file.
 *   - **Shape discipline** — `.mjs` files are non-empty + contain Node-ESM
 *     markers (import/export or top-level shebang); `.sh` files start with
 *     a bash shebang.
 *   - **Gate 7 precondition** — every referenced `.sh` file is
 *     shellcheck-compatible shape (bash shebang present).
 *   - **No stealth dependencies** — scripts under `scripts/` that are
 *     NOT referenced by CI but have `ci-gate-` prefix should be wired
 *     up or retracted (prevents orphan gate scripts).
 *
 * Drift scenarios covered:
 *   - Add `run: node scripts/new-gate.mjs` to CI without committing the
 *     file → case 2 fails loudly (file missing).
 *   - Remove a `ci-gate-*` script from disk but keep CI reference → case
 *     2 fails.
 *   - `.sh` file drops its shebang after refactor → case 4 fails
 *     (Gate 7 precondition broken).
 *   - New `scripts/ci-gate-X.sh` file without wiring into CI → case 5
 *     fails (orphan gate script).
 *
 * Symmetric to prior integrity edges:
 *   #175 GitHub Actions workflow schema (CI-YAML side — this PR locks
 *   the filesystem side).
 *
 * Opens the **33rd integrity edge — TRITRIACONTAGON** (33-gon). First
 * CI-referenced script file reference integrity edge. Novel family
 * #17. Integrity dotriacontagon → tritriacontagon (33-gon). Pillar 4
 * SDLC CI infrastructure now has BOTH sides locked: workflow YAML
 * schema (#175) + referenced-file existence (this PR).
 *
 * Non-goals: validating script CONTENT correctness (each script has
 * its own unit tests), asserting scripts pass shellcheck/eslint (CI
 * gates 3+7 enforce that — this edge asserts shape precondition), or
 * pinning script behaviors (tests already exist).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const CI_YAML_PATH = resolve(REPO_ROOT, '.github/workflows/ci.yml');
const SCRIPTS_DIR = resolve(REPO_ROOT, 'scripts');

/**
 * Extract all `scripts/X.Y` path references from the CI workflow file.
 */
function extractScriptReferences(yaml: string): Set<string> {
  const out = new Set<string>();
  for (const m of yaml.matchAll(/\bscripts\/([A-Za-z0-9_.-]+)\b/g)) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Check if a file starts with a bash shebang.
 */
function hasBashShebang(path: string): boolean {
  const content = readFileSync(path, 'utf8');
  return /^#!\/(?:usr\/)?bin\/(?:env\s+)?bash/.test(content.split('\n')[0]);
}

/**
 * Check if a Node ESM file has valid shape (import/export, shebang, or Node-ish
 * top-level).
 */
function hasNodeEsmShape(path: string): boolean {
  const content = readFileSync(path, 'utf8');
  const firstNonCommentLines = content
    .split('\n')
    .slice(0, 20)
    .join('\n');
  // Accept shebang, import, export, const, let, class, function — Node-ish
  // module entry shapes.
  return /^#!|^import\s|^export\s|^const\s|^let\s|^class\s|^function\s|^async\s+function/m.test(
    firstNonCommentLines,
  );
}

describe('CI script-file reference integrity — 33rd edge (TRITRIACONTAGON)', () => {
  const ciYaml = readFileSync(CI_YAML_PATH, 'utf8');
  const references = extractScriptReferences(ciYaml);

  it('ci.yml references at least 3 scripts (sanity floor — Gate 1, Gate 2, Gate 5, Gate 6)', () => {
    expect(
      references.size,
      `ci.yml parsed ${references.size} scripts/ references — expected ≥ 3 (validate-strategies, ci-gate-secret-scan, ci-gate-deploy-smoke, ci-gate-paper-gate-lock)`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('every scripts/X.Y referenced in ci.yml exists on disk (existence coherence)', () => {
    for (const ref of references) {
      const path = resolve(SCRIPTS_DIR, ref);
      expect(
        existsSync(path),
        `ci.yml references 'scripts/${ref}' but file does not exist — CI will fail with opaque 'No such file or directory'`,
      ).toBe(true);
    }
  });

  it('every referenced `.mjs` script has Node-ESM shape (non-empty, import/export/const/function)', () => {
    for (const ref of references) {
      if (!ref.endsWith('.mjs')) continue;
      const path = resolve(SCRIPTS_DIR, ref);
      if (!existsSync(path)) continue;
      expect(
        hasNodeEsmShape(path),
        `script 'scripts/${ref}' does not have Node-ESM shape — expected import/export/const/function/shebang in first 20 lines`,
      ).toBe(true);
    }
  });

  it('every referenced `.sh` script starts with bash shebang (Gate 7 shellcheck precondition)', () => {
    for (const ref of references) {
      if (!ref.endsWith('.sh')) continue;
      const path = resolve(SCRIPTS_DIR, ref);
      if (!existsSync(path)) continue;
      expect(
        hasBashShebang(path),
        `script 'scripts/${ref}' missing '#!/usr/bin/env bash' (or equivalent) shebang — Gate 7 shellcheck precondition broken`,
      ).toBe(true);
    }
  });

  it('no orphan `ci-gate-*` scripts (scripts with prefix must be wired into CI or marked local-only)', () => {
    // ci-gate-local.mjs is intentionally local-only (runs typecheck+lint+test+secret-scan locally)
    const LOCAL_ONLY = new Set(['ci-gate-local.mjs']);
    const scriptFiles = readdirSync(SCRIPTS_DIR).filter((f) =>
      /^ci-gate-[\w.-]+\.(mjs|sh|js|cjs)$/.test(f),
    );
    for (const f of scriptFiles) {
      if (LOCAL_ONLY.has(f)) continue;
      expect(
        references.has(f),
        `scripts/${f} has 'ci-gate-' prefix but is NOT referenced by ci.yml — either wire up or retract (prevents orphan gate scripts)`,
      ).toBe(true);
    }
  });

  it('every referenced script is non-empty (sanity)', () => {
    for (const ref of references) {
      const path = resolve(SCRIPTS_DIR, ref);
      if (!existsSync(path)) continue;
      const stats = readFileSync(path, 'utf8');
      expect(
        stats.length,
        `script 'scripts/${ref}' is empty (0 bytes)`,
      ).toBeGreaterThan(0);
    }
  });

  it('Gate 1 validate-strategies.mjs referenced (strategy validator gate)', () => {
    expect(
      references.has('validate-strategies.mjs'),
      'ci.yml does not reference scripts/validate-strategies.mjs — Gate 1 strategy validator missing',
    ).toBe(true);
  });

  it('Gate 2 ci-gate-secret-scan.mjs referenced (secret scanner gate)', () => {
    expect(
      references.has('ci-gate-secret-scan.mjs'),
      'ci.yml does not reference scripts/ci-gate-secret-scan.mjs — Gate 2 secret scanner missing',
    ).toBe(true);
  });

  it('Gate 5 ci-gate-deploy-smoke.mjs referenced (post-merge deploy smoke)', () => {
    expect(
      references.has('ci-gate-deploy-smoke.mjs'),
      'ci.yml does not reference scripts/ci-gate-deploy-smoke.mjs — Gate 5 deploy smoke missing',
    ).toBe(true);
  });

  it('Gate 6 ci-gate-paper-gate-lock.sh referenced (Pillar 1 date-lock guardian)', () => {
    expect(
      references.has('ci-gate-paper-gate-lock.sh'),
      'ci.yml does not reference scripts/ci-gate-paper-gate-lock.sh — Gate 6 paper-gate date-lock missing',
    ).toBe(true);
  });

  it('composite: 4 Gate-specific scripts all present + shape-correct (CI Gate integrity)', () => {
    const gateScripts = [
      'validate-strategies.mjs',
      'ci-gate-secret-scan.mjs',
      'ci-gate-deploy-smoke.mjs',
      'ci-gate-paper-gate-lock.sh',
    ];
    for (const f of gateScripts) {
      expect(references.has(f), `ci.yml missing ${f}`).toBe(true);
      const path = resolve(SCRIPTS_DIR, f);
      expect(existsSync(path), `${f} not on disk`).toBe(true);
      if (f.endsWith('.mjs')) {
        expect(hasNodeEsmShape(path), `${f} not ESM shape`).toBe(true);
      } else if (f.endsWith('.sh')) {
        expect(hasBashShebang(path), `${f} missing bash shebang`).toBe(true);
      }
    }
  });
});
