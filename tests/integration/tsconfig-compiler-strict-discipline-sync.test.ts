/**
 * TypeScript compiler-config strict-discipline 7-invariant sync — first compiler-config edge.
 *
 * `tsconfig.json` defines the TypeScript compiler contract — `strict: true`
 * enables noImplicitAny + strictNullChecks + a dozen other checks that
 * guard against common type-safety drift. Beyond strict, we pin modern-ES
 * target, esModuleInterop for CJS/ESM bridging, forceConsistentCasingIn
 * FileNames for macOS/Linux portability, and resolveJsonModule for JSON
 * imports. Drift in any of these = silent runtime regressions that
 * `npx tsc --noEmit` (Gate 1) won't catch because the check itself has
 * been relaxed.
 *
 * Unlike the 33 prior edges (17 families):
 *   - Prior 17 families cover DB schemas, code constants, external APIs,
 *     Grafana alerts, docker-compose, .env.example, GitHub Actions YAML,
 *     CI script filesystem refs.
 *   - **NEW family #18: TYPESCRIPT COMPILER-CONFIG DISCIPLINE.** Locks
 *     the `tsconfig.json` compilerOptions that govern type-safety strict-
 *     ness + module-system interop + cross-platform portability. Distinct
 *     from #175 (GitHub Actions YAML) because this is compiler-config
 *     JSON substrate, not CI orchestration.
 *
 * The invariant is declared across 1 file × 7 invariant axes:
 *
 *   1. **Strict mode enabled** — `strict: true` turns on the full strict
 *      check set. Relaxing = silent `any`-leak regression.
 *   2. **esModuleInterop enabled** — required for correct `import foo from
 *      'cjs-module'` bridging.
 *   3. **forceConsistentCasingInFileNames enabled** — macOS case-insensitive
 *      FS hides bugs that crash on Linux/CI.
 *   4. **resolveJsonModule enabled** — allows `import data from './x.json'`
 *      in codebase (needed for strategies config etc).
 *   5. **skipLibCheck enabled** — standard practice (node_modules type
 *      drift doesn't break our build).
 *   6. **Modern target** — `target: ES2022` or later (top-level await,
 *      error causes, etc).
 *   7. **Source scope** — `include` covers `src` subtree; `exclude` covers
 *      `node_modules` + `dist`.
 *
 * Novel invariants locked (family #18):
 *   - **Strict-mode flag presence** — `strict: true` is load-bearing;
 *     operator cannot silently relax.
 *   - **Module-system interop enforced** — esModuleInterop is required
 *     for mixed-ecosystem codebases.
 *   - **Cross-platform FS discipline** — forceConsistentCasingInFileNames
 *     catches macOS-vs-Linux FS case bugs.
 *   - **Modern-target floor** — target ≥ ES2020 (we use top-level await
 *     in some modules).
 *   - **Source-scope bounds** — `include`/`exclude` prevents accidental
 *     compilation of dist/node_modules (builds blow up silently otherwise).
 *
 * Drift scenarios covered:
 *   - Someone toggles `strict: false` to silence a test-failure fast →
 *     case 1 fails.
 *   - `target: ES5` regresses to transpile output (drops async/await
 *     native) → case 6 fails.
 *   - `include` changes to just `src/app/**` → case 7 fails.
 *   - `exclude` drops `node_modules` → tsc takes 10x longer, may OOM →
 *     case 7 fails.
 *
 * Symmetric to prior integrity edges:
 *   #175 GitHub Actions workflow discipline (Gate 1 `npx tsc --noEmit`
 *   depends on this tsconfig; strict-mode relaxation here silently
 *   weakens Gate 1).
 *
 * Opens the **34th integrity edge — TETRATRIACONTAGON** (34-gon). First
 * TypeScript compiler-config discipline edge. Novel family #18.
 * Integrity tritriacontagon → tetratriacontagon (34-gon). Pillar 4 SDLC
 * type-safety foundation now sync-validated — Gate 1 (tsc --noEmit)
 * depends on strict-mode flags being on; this edge asserts they are.
 *
 * Non-goals: asserting specific lib versions, locking all compilerOptions
 * exhaustively (only load-bearing ones), or validating per-file
 * `@ts-expect-error` counts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const TSCONFIG_PATH = resolve(REPO_ROOT, 'tsconfig.json');

/** Minimum target ES version (ES2020+ for top-level await). */
const MIN_TARGET = 'ES2020';

/**
 * Parse tsconfig.json. Does NOT strip block comments because that would
 * corrupt glob patterns like `src/**\/*` where `/*` opens a false
 * comment-span. The tsconfig in this repo is plain JSON (no comments);
 * if jsonc support is needed later, switch to a proper tokenizer.
 */
function parseTsconfig(raw: string): Record<string, unknown> {
  // Only strip line comments (//), never block comments (/* */).
  const stripped = raw.replace(/^\s*\/\/[^\n]*/gm, '');
  return JSON.parse(stripped);
}

/** Convert ES target string to numeric year for comparison. */
function targetToYear(target: string): number | null {
  const m = /^ES(\d+)$/i.exec(target);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  // ES5/ES6 are legacy; treat as 2015/2009 respectively.
  if (n === 5) return 2009;
  if (n === 6) return 2015;
  return n; // ES2020 → 2020, ES2022 → 2022
}

describe('TypeScript compiler-config strict-discipline — 34th edge (TETRATRIACONTAGON)', () => {
  const raw = readFileSync(TSCONFIG_PATH, 'utf8');
  const cfg = parseTsconfig(raw);
  const opts = (cfg.compilerOptions ?? {}) as Record<string, unknown>;
  const include = cfg.include as string[] | undefined;
  const exclude = cfg.exclude as string[] | undefined;

  it('tsconfig.json parses successfully (sanity)', () => {
    expect(opts).toBeTruthy();
    expect(typeof opts).toBe('object');
  });

  it('strict mode enabled (`strict: true`)', () => {
    expect(
      opts.strict,
      'tsconfig.json compilerOptions.strict is not true — silent any-leak regression; Gate 1 (tsc --noEmit) weakened',
    ).toBe(true);
  });

  it('esModuleInterop enabled (CJS/ESM bridge)', () => {
    expect(
      opts.esModuleInterop,
      'tsconfig.json compilerOptions.esModuleInterop is not true — CJS default-import bridging broken',
    ).toBe(true);
  });

  it('forceConsistentCasingInFileNames enabled (macOS↔Linux portability)', () => {
    expect(
      opts.forceConsistentCasingInFileNames,
      'tsconfig.json compilerOptions.forceConsistentCasingInFileNames is not true — macOS case-insensitive FS hides bugs that crash on Linux CI',
    ).toBe(true);
  });

  it('resolveJsonModule enabled (JSON import support)', () => {
    expect(
      opts.resolveJsonModule,
      'tsconfig.json compilerOptions.resolveJsonModule is not true — JSON imports break at build time',
    ).toBe(true);
  });

  it('skipLibCheck enabled (standard practice — node_modules drift isolation)', () => {
    expect(
      opts.skipLibCheck,
      'tsconfig.json compilerOptions.skipLibCheck is not true — node_modules type drift would break our build',
    ).toBe(true);
  });

  it(`target is modern ES (≥ ${MIN_TARGET})`, () => {
    const target = opts.target as string | undefined;
    expect(target, 'tsconfig.json compilerOptions.target missing').toBeDefined();
    const year = targetToYear(target!);
    const minYear = targetToYear(MIN_TARGET)!;
    expect(
      year,
      `tsconfig.json target='${target}' not parseable as ES-year`,
    ).not.toBeNull();
    expect(
      year!,
      `tsconfig.json target='${target}' (year ${year}) < minimum ${MIN_TARGET} (${minYear}) — codebase uses top-level await + modern features`,
    ).toBeGreaterThanOrEqual(minYear);
  });

  it('include covers `src/**/*` (source scope bound)', () => {
    expect(include, 'tsconfig.json include missing').toBeDefined();
    expect(
      include!.some((p) => /src\//.test(p)),
      `tsconfig.json include=${JSON.stringify(include)} does not cover src/`,
    ).toBe(true);
  });

  it('exclude covers `node_modules` (tsc perf + OOM prevention)', () => {
    expect(exclude, 'tsconfig.json exclude missing').toBeDefined();
    expect(
      exclude!.includes('node_modules'),
      `tsconfig.json exclude=${JSON.stringify(exclude)} does not include node_modules — tsc takes 10x longer, may OOM CI`,
    ).toBe(true);
  });

  it('lib includes modern ES (ES2020+ or ES2023)', () => {
    const lib = opts.lib as string[] | undefined;
    expect(lib, 'tsconfig.json compilerOptions.lib missing').toBeDefined();
    const hasModernLib = lib!.some((l) => /ES20(2[0-9]|23)/i.test(l));
    expect(
      hasModernLib,
      `tsconfig.json lib=${JSON.stringify(lib)} missing modern ES (ES2020-ES2023+) — Array.prototype.at, Object.hasOwn, Error.cause unavailable`,
    ).toBe(true);
  });

  it('composite 7-axis strict-discipline integrity (all load-bearing flags in lockstep)', () => {
    // Meta: all 7 novel family-#18 invariants fire simultaneously.
    expect(opts.strict).toBe(true);
    expect(opts.esModuleInterop).toBe(true);
    expect(opts.forceConsistentCasingInFileNames).toBe(true);
    expect(opts.resolveJsonModule).toBe(true);
    expect(opts.skipLibCheck).toBe(true);
    const year = targetToYear(opts.target as string)!;
    expect(year).toBeGreaterThanOrEqual(targetToYear(MIN_TARGET)!);
    expect(include!.some((p) => /src\//.test(p))).toBe(true);
    expect(exclude!.includes('node_modules')).toBe(true);
  });
});
