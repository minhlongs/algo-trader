/**
 * Cross-tsconfig variant coherence 7-invariant sync — first multi-config
 * TypeScript-compiler triangle edge.
 *
 * The project ships 3 distinct tsconfig variants, each with a specific
 * compilation target:
 *   - `tsconfig.json` — Node.js build (locked by PR #177)
 *   - `tsconfig.worker.json` — Cloudflare Worker bundle
 *   - `dashboard/tsconfig.json` — React dashboard (Vite-compiled)
 *
 * Drift between variants manifests as:
 *   - Worker variant misses `@cloudflare/workers-types` → runtime
 *     reference errors at deploy time (caught post-CI, operator woken)
 *   - Dashboard variant loses `jsx: "react-jsx"` → .tsx component
 *     compiles fail or silently emit no JSX
 *   - One variant drops `strict: true` → type-safety baseline broken
 *     in ONE surface while others enforce it (asymmetric safety)
 *   - Worker include scope widens beyond `src/workers/**` → node-only
 *     code compiles against Cloudflare-runtime types (false negatives)
 *
 * Unlike the 40 prior edges (24 families):
 *   - PR #177 locks ONE tsconfig (root) and #179 locks the EXISTENCE of
 *     tsconfig.worker.json but not its INTERNAL shape
 *   - **NEW family #25: CROSS-TSCONFIG VARIANT COHERENCE.**
 *     Locks the 3-way triangle — shared baseline (strict, skipLibCheck)
 *     + variant-specific divergence (worker CF types, dashboard React
 *     JSX). First multi-config triangle; distinct from #177 single-
 *     config content lock.
 *
 * The invariant is declared across 3 files × 7 invariant axes:
 *
 *   1. **All 3 tsconfigs exist + parse** — sanity floor.
 *   2. **Shared strict baseline** — `strict: true` in all 3.
 *   3. **Shared skipLibCheck baseline** — `skipLibCheck: true` in all 3
 *      (dependency-trust floor; build time regression if missing).
 *   4. **Worker variant: Cloudflare types** — `types` includes
 *      `"@cloudflare/workers-types"` AND `"node"`.
 *   5. **Worker variant: outDir + scoped include** — `outDir ==
 *      "dist/worker"` + `include` scoped to the workers subtree only
 *      (prevents cross-contamination with node code).
 *   6. **Dashboard variant: React JSX** — `jsx: "react-jsx"` + `lib`
 *      includes `"DOM"` and `"DOM.Iterable"`.
 *   7. **Dashboard + Worker: bundler-compat** — both have
 *      `isolatedModules: true` (Vite + esbuild require per-file
 *      transform).
 *
 * Novel invariants locked (family #25):
 *   - **Baseline-variant asymmetry** — strict + skipLibCheck are
 *     baseline; domain-specific flags (types, jsx, include) are
 *     variant. Drift in either dimension fails distinctly.
 *   - **Include scope discipline** — worker MUST be scoped to
 *     `src/workers/**` only; widening would let node code compile
 *     against Cloudflare types silently.
 *   - **Cross-edge with #177** — root tsconfig strict is already
 *     locked; this edge ensures worker + dashboard DO NOT regress
 *     beneath that bar.
 *
 * Drift scenarios covered:
 *   - Developer drops `"@cloudflare/workers-types"` from worker
 *     variant while migrating to Hono → case 4 fails.
 *   - Dashboard "simplification" PR removes `jsx: "react-jsx"` → case
 *     6 fails (all .tsx component tests break).
 *   - Worker include widened beyond the workers subtree → case 5
 *     fails (cross-contamination).
 *   - Anyone disables `strict` in any variant → case 2 fails
 *     (type-safety baseline broken).
 *
 * Symmetric to prior integrity edges:
 *   #177 tsconfig compiler-config strict-discipline (root variant
 *   content lock — this edge extends to 2 more variants).
 *   #179 Wrangler Cloudflare-deploy existence of tsconfig.worker.json
 *   (this edge locks its INTERNAL shape).
 *   #181 vitest test-harness root+dashboard distinction (same
 *   multi-config pattern, distinct tool surface).
 *
 * Opens the **41st integrity edge — HENITETRACONTAGON** (41-gon). First
 * multi-config tsconfig triangle edge. Novel family #25. Integrity
 * tetracontagon → henitetracontagon (41-gon).
 *
 * Non-goals: asserting EVERY compiler option of every variant (YAGNI —
 * focus on load-bearing divergence); locking target/module versions
 * (#177 handles root; worker/dashboard have different bundler
 * pipelines that evolve independently).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const ROOT_TSCONFIG = resolve(REPO_ROOT, 'tsconfig.json');
const WORKER_TSCONFIG = resolve(REPO_ROOT, 'tsconfig.worker.json');
const DASHBOARD_TSCONFIG = resolve(REPO_ROOT, 'dashboard/tsconfig.json');

/**
 * Strip line comments from JSON-with-comments (tsconfig format).
 * Line-first to avoid eating inline slashes inside strings.
 */
function stripJsonComments(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      if (idx === -1) return line;
      const before = line.slice(0, idx);
      if ((before.match(/"/g) || []).length % 2 === 1) return line;
      return before;
    })
    .join('\n');
}

function parseTsconfig(path: string): Record<string, unknown> {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(stripJsonComments(raw));
}

function opts(cfg: Record<string, unknown>): Record<string, unknown> {
  return (cfg.compilerOptions as Record<string, unknown>) ?? {};
}

describe('cross-tsconfig variant coherence — 41st edge (HENITETRACONTAGON)', () => {
  const rootCfg = parseTsconfig(ROOT_TSCONFIG);
  const workerCfg = parseTsconfig(WORKER_TSCONFIG);
  const dashCfg = parseTsconfig(DASHBOARD_TSCONFIG);

  it('all 3 tsconfigs exist and parse (sanity floor)', () => {
    expect(rootCfg).toBeTruthy();
    expect(workerCfg).toBeTruthy();
    expect(dashCfg).toBeTruthy();
  });

  it('shared baseline: `strict: true` in all 3 variants', () => {
    expect(opts(rootCfg).strict, 'root tsconfig missing strict:true').toBe(true);
    expect(opts(workerCfg).strict, 'worker tsconfig missing strict:true').toBe(true);
    expect(opts(dashCfg).strict, 'dashboard tsconfig missing strict:true').toBe(true);
  });

  it('shared baseline: `skipLibCheck: true` in all 3 variants', () => {
    expect(opts(rootCfg).skipLibCheck).toBe(true);
    expect(opts(workerCfg).skipLibCheck).toBe(true);
    expect(opts(dashCfg).skipLibCheck).toBe(true);
  });

  it('worker variant: types includes @cloudflare/workers-types AND node', () => {
    const types = opts(workerCfg).types as string[] | undefined;
    expect(Array.isArray(types), 'worker tsconfig.compilerOptions.types must be an array').toBe(true);
    expect(
      types!.includes('@cloudflare/workers-types'),
      `worker tsconfig.types does not include '@cloudflare/workers-types' — runtime reference errors at deploy. Actual: ${JSON.stringify(types)}`,
    ).toBe(true);
    expect(
      types!.includes('node'),
      `worker tsconfig.types does not include 'node' — Node.js API references would fail. Actual: ${JSON.stringify(types)}`,
    ).toBe(true);
  });

  it('worker variant: outDir=dist/worker AND include scoped to src/workers/**', () => {
    expect(opts(workerCfg).outDir).toBe('dist/worker');
    const include = workerCfg.include as string[] | undefined;
    expect(Array.isArray(include)).toBe(true);
    expect(
      include!.some((p) => /src\/platform\/workers\/\*\*/.test(p)),
      `worker tsconfig.include must be scoped to src/platform/workers/**/*.ts — widening lets node code compile against CF types. Actual: ${JSON.stringify(include)}`,
    ).toBe(true);
    const unsafe = include!.filter((p) => p === 'src' || /^src\/\*\*/.test(p) || p === '**/*');
    expect(
      unsafe,
      `worker tsconfig.include contains over-broad patterns: ${unsafe.join(', ')} — cross-contamination with node-only code`,
    ).toEqual([]);
  });

  it('dashboard variant: jsx="react-jsx" AND lib includes DOM + DOM.Iterable', () => {
    expect(
      opts(dashCfg).jsx,
      'dashboard tsconfig.jsx must be "react-jsx" — .tsx component compilation broken without it',
    ).toBe('react-jsx');
    const lib = opts(dashCfg).lib as string[] | undefined;
    expect(Array.isArray(lib)).toBe(true);
    expect(
      lib!.includes('DOM'),
      `dashboard tsconfig.lib missing "DOM" — browser globals unresolvable. Actual: ${JSON.stringify(lib)}`,
    ).toBe(true);
    expect(
      lib!.includes('DOM.Iterable'),
      `dashboard tsconfig.lib missing "DOM.Iterable" — NodeList iteration broken. Actual: ${JSON.stringify(lib)}`,
    ).toBe(true);
  });

  it('worker + dashboard: isolatedModules=true (bundler-compat discipline)', () => {
    expect(
      opts(workerCfg).isolatedModules,
      'worker tsconfig.isolatedModules must be true — esbuild bundler requires per-file transform',
    ).toBe(true);
    expect(
      opts(dashCfg).isolatedModules,
      'dashboard tsconfig.isolatedModules must be true — Vite bundler requires per-file transform',
    ).toBe(true);
  });

  it('dashboard variant: noEmit=true (Vite owns the transform pipeline)', () => {
    expect(
      opts(dashCfg).noEmit,
      'dashboard tsconfig.noEmit must be true — Vite handles compilation; tsc would emit stale files',
    ).toBe(true);
  });

  it('worker variant: module=ES2022 OR ESNext (ESM required by Cloudflare runtime)', () => {
    const mod = opts(workerCfg).module as string | undefined;
    expect(
      mod === 'ES2022' || mod === 'ESNext' || mod === 'ESM',
      `worker tsconfig.module must be ESM-compatible (ES2022|ESNext|ESM) — Cloudflare Worker runtime rejects CJS. Actual: ${JSON.stringify(mod)}`,
    ).toBe(true);
  });

  it('composite: 7 axes hold simultaneously (variant-coherence triangle)', () => {
    expect(opts(rootCfg).strict).toBe(true);
    expect(opts(workerCfg).strict).toBe(true);
    expect(opts(dashCfg).strict).toBe(true);
    const wt = opts(workerCfg).types as string[];
    expect((wt.includes('@cloudflare/workers-types') || wt.includes('workers-types')) && wt.includes('node')).toBe(true);
    expect(opts(dashCfg).jsx).toBe('react-jsx');
    expect((opts(dashCfg).lib as string[]).includes('DOM')).toBe(true);
    expect(opts(workerCfg).isolatedModules && opts(dashCfg).isolatedModules).toBe(true);
  });
});
