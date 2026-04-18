/**
 * Vitest test-harness configuration discipline 7-invariant sync — first
 * TypeScript-config-as-code substrate edge.
 *
 * `vitest.config.ts` (root) + `dashboard/vitest.config.ts` define the
 * test-harness primitive. Drift manifests as:
 *   - Silent test skip (changing `exclude`-globs so load-bearing suites
 *     no longer run)
 *   - Pool/isolation swap (`forks` → `threads`) silently breaking tests
 *     that rely on process isolation
 *   - Environment collapse (dashboard `jsdom` → root default) breaking
 *     React component tests
 *   - `globals: true` → `false` breaking every `describe`/`it`/`expect`
 *     import
 *
 * Unlike the 37 prior edges (21 families):
 *   - Prior 21 cover DB schemas, code constants, external APIs, Grafana,
 *     docker-compose, .env.example, GitHub Actions YAML, CI-script fs,
 *     tsconfig JSON, .gitignore, wrangler TOML, package.json. None
 *     locks the vitest substrate — the runner that executes ALL prior
 *     edges' tests.
 *   - **NEW family #22: VITEST TEST-HARNESS CONFIGURATION DISCIPLINE.**
 *     Locks the test-runner substrate (TS-config-as-code — distinct from
 *     #177 tsconfig JSON, #179 wrangler TOML, #180 package.json JSON).
 *     First TypeScript-source config substrate.
 *
 * The invariant is declared across 2 files × 7 invariant axes:
 *
 *   1. **Both configs exist + parse** — root + dashboard.
 *   2. **Root `globals: true`** — every test file assumes globals
 *      (describe/it/expect imports optional).
 *   3. **Root `pool: 'forks'`** — process isolation is load-bearing for
 *      D1 singleton + database integration tests.
 *   4. **Root exclude covers load-bearing patterns**:
 *      `**\/node_modules/**`, `tests/strategies/**`, `dashboard/**`.
 *      Drift = dashboard tests run in root (environment mismatch) or
 *      strategies run broken (unimplemented infra).
 *   5. **Dashboard `environment: 'jsdom'`** — React component tests
 *      require DOM (jsdom/happy-dom), not Node.
 *   6. **Dashboard `setupFiles` non-empty** — React Testing Library
 *      setup required for component render tests.
 *   7. **Dashboard uses `@vitejs/plugin-react`** — JSX transform
 *      required for .tsx component tests.
 *
 * Novel invariants locked (family #22):
 *   - **Runner separation** — dashboard MUST be excluded from root
 *     (different environment) AND have its own config (load-bearing).
 *   - **Pool discipline** — `forks` vs `threads` swap silently breaks
 *     D1 + Postgres integration tests via shared-state contamination.
 *   - **Environment-source parity** — jsdom is declared in ONLY the
 *     dashboard config; root MUST NOT declare jsdom (would break
 *     node-only infra tests).
 *
 * Drift scenarios covered:
 *   - Developer flips `pool: 'forks'` → `'threads'` for speed → case 3
 *     fails (pool lock).
 *   - Someone removes `'dashboard/**'` from exclude to unify test run →
 *     case 4 fails (runner-separation).
 *   - `@vitejs/plugin-react` upgrade regresses to no-plugin config →
 *     case 7 fails (JSX transform gap).
 *
 * Symmetric to prior integrity edges:
 *   #177 tsconfig compiler-config strict-discipline (same TypeScript
 *   ecosystem, distinct config class — compiler vs runner).
 *   #180 package.json manifest discipline (package identity surface vs
 *   runner-config surface — complementary).
 *
 * Opens the **38th integrity edge — OCTATRIACONTAGON** (38-gon). First
 * TS-source config substrate. Novel family #22. Integrity heptatriacontagon
 * → octatriacontagon (38-gon). Test-runner infrastructure now locked —
 * silent skip of load-bearing suites blocked at CI.
 *
 * Non-goals: asserting every exclude glob (4 are load-bearing, others
 * are convenience); locking test globals to a specific set (vitest's
 * `globals: true` is binary); asserting coverage thresholds (separate
 * concern, not currently configured).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const ROOT_VITEST_PATH = resolve(REPO_ROOT, 'vitest.config.ts');
const DASHBOARD_VITEST_PATH = resolve(REPO_ROOT, 'dashboard/vitest.config.ts');

/**
 * Load-bearing exclude patterns. Each MUST appear in root exclude:
 * - `**\/node_modules/**` — baseline hygiene (vitest would OOM otherwise)
 * - `tests/strategies/**` — Polymarket strategies disabled (unimplemented infra)
 * - `dashboard/**` — dashboard has its own runner (jsdom environment)
 */
const REQUIRED_ROOT_EXCLUDE_SUBSTRINGS = [
  'node_modules',
  'tests/strategies',
  'dashboard/',
];

/**
 * Strip TypeScript line comments and C-style block comments.
 * Line-first to avoid eating inline slashes inside block comments or strings.
 */
function stripTsComments(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      if (idx === -1) return line;
      const before = line.slice(0, idx);
      const squoteCount = (before.match(/'/g) || []).length;
      const dquoteCount = (before.match(/"/g) || []).length;
      const btickCount = (before.match(/`/g) || []).length;
      if (squoteCount % 2 === 1 || dquoteCount % 2 === 1 || btickCount % 2 === 1) {
        return line;
      }
      return before;
    })
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('vitest test-harness configuration discipline — 38th edge (OCTATRIACONTAGON)', () => {
  const rootRaw = readFileSync(ROOT_VITEST_PATH, 'utf8');
  const dashRaw = readFileSync(DASHBOARD_VITEST_PATH, 'utf8');
  const rootClean = stripTsComments(rootRaw);
  const dashClean = stripTsComments(dashRaw);

  it('both vitest configs exist and are non-empty (sanity floor)', () => {
    expect(rootRaw.length).toBeGreaterThan(50);
    expect(dashRaw.length).toBeGreaterThan(50);
  });

  it('root vitest imports defineConfig from vitest/config (sanity)', () => {
    expect(
      /import\s*\{\s*defineConfig\s*\}\s*from\s*['"]vitest\/config['"]/.test(rootClean),
      'root vitest.config.ts must import defineConfig from vitest/config',
    ).toBe(true);
  });

  it('root vitest declares `globals: true` (describe/it/expect assumed global)', () => {
    expect(
      /globals\s*:\s*true/.test(rootClean),
      'root vitest.config.ts must set test.globals = true — test files use describe/it/expect without import',
    ).toBe(true);
  });

  it("root vitest declares `pool: 'forks'` (process isolation for D1/Postgres)", () => {
    expect(
      /pool\s*:\s*['"]forks['"]/.test(rootClean),
      "root vitest.config.ts must set test.pool = 'forks' — threads pool breaks D1 singleton + database integration tests via shared-state contamination",
    ).toBe(true);
  });

  it('root vitest exclude contains REQUIRED_ROOT_EXCLUDE_SUBSTRINGS', () => {
    for (const needle of REQUIRED_ROOT_EXCLUDE_SUBSTRINGS) {
      expect(
        rootClean.includes(needle),
        `root vitest.config.ts exclude missing "${needle}" — load-bearing exclude (either silent test bloat, broken strategy tests, or dashboard environment mismatch)`,
      ).toBe(true);
    }
  });

  it('root vitest MUST NOT declare `environment: "jsdom"` (node-only infra tests)', () => {
    expect(
      /environment\s*:\s*['"]jsdom['"]/.test(rootClean),
      'root vitest.config.ts declares jsdom environment — would break node-only infra tests (D1/Postgres/HTTP); jsdom belongs ONLY in dashboard config',
    ).toBe(false);
  });

  it('dashboard vitest declares `environment: "jsdom"` (React DOM tests)', () => {
    expect(
      /environment\s*:\s*['"]jsdom['"]/.test(dashClean),
      'dashboard/vitest.config.ts must set test.environment = "jsdom" — React component tests require DOM',
    ).toBe(true);
  });

  it('dashboard vitest declares non-empty `setupFiles` (RTL setup)', () => {
    expect(
      /setupFiles\s*:\s*\[\s*['"][^'"]+['"]/.test(dashClean),
      'dashboard/vitest.config.ts must set test.setupFiles — React Testing Library setup required',
    ).toBe(true);
  });

  it('dashboard vitest registers @vitejs/plugin-react (JSX transform)', () => {
    expect(
      /from\s*['"]@vitejs\/plugin-react['"]/.test(dashClean),
      'dashboard/vitest.config.ts must import @vitejs/plugin-react — JSX transform required for .tsx component tests',
    ).toBe(true);
    expect(
      /plugins\s*:\s*\[\s*react\(\)/.test(dashClean),
      'dashboard/vitest.config.ts must register react() in plugins — JSX transform',
    ).toBe(true);
  });

  it('dashboard vitest declares `globals: true` (symmetric with root)', () => {
    expect(
      /globals\s*:\s*true/.test(dashClean),
      'dashboard/vitest.config.ts must set test.globals = true — symmetric with root for describe/it/expect parity',
    ).toBe(true);
  });

  it('composite: 7 axes hold simultaneously (root + dashboard coherence)', () => {
    expect(/globals\s*:\s*true/.test(rootClean)).toBe(true);
    expect(/pool\s*:\s*['"]forks['"]/.test(rootClean)).toBe(true);
    for (const n of REQUIRED_ROOT_EXCLUDE_SUBSTRINGS) {
      expect(rootClean.includes(n), `root exclude missing "${n}"`).toBe(true);
    }
    expect(/environment\s*:\s*['"]jsdom['"]/.test(rootClean)).toBe(false);
    expect(/environment\s*:\s*['"]jsdom['"]/.test(dashClean)).toBe(true);
    expect(/from\s*['"]@vitejs\/plugin-react['"]/.test(dashClean)).toBe(true);
    expect(/globals\s*:\s*true/.test(dashClean)).toBe(true);
  });
});
