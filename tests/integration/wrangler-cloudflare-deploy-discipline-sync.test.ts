/**
 * Wrangler Cloudflare Workers deploy-config discipline 8-invariant sync.
 *
 * `wrangler.toml` declares the Cloudflare Workers deployment contract —
 * worker name, entry point, compatibility flags, KV namespaces, env-scoped
 * vars, and build command. Drift = deploy fails silently (wrong worker
 * deployed), Node stdlib unavailable (nodejs_compat missing), or staging
 * environment overwrites production (env-scoping broken).
 *
 * Unlike the 35 prior edges (19 families):
 *   - **NEW family #20: WRANGLER CLOUDFLARE-DEPLOY DISCIPLINE.** Locks
 *     the `wrangler.toml` substrate. Distinct from #175 (GitHub Actions
 *     YAML), #173 (docker-compose), #177 (tsconfig JSON), #174
 *     (.env.example), #178 (.gitignore) — this is TOML substrate for
 *     Cloudflare-specific deploy primitives.
 *
 * The contract is declared across 8 invariant axes:
 *
 *   1. **Worker name pinned** — `name = "algo-trader"` matches deploy
 *      scripts + CF dashboard.
 *   2. **Entry point exists** — `main` points to a TS file that exists
 *      on disk.
 *   3. **Compatibility date pinned** — `compatibility_date` is an
 *      ISO date in a reasonable range (not future, not ancient).
 *   4. **Node-compat flag present** — `compatibility_flags` includes
 *      `nodejs_compat` (required for Node stdlib).
 *   5. **KV namespace bound** — `[[kv_namespaces]]` with `binding`,
 *      `id`, `preview_id` all non-empty.
 *   6. **Production vars correct** — `[vars].ENVIRONMENT = "production"`.
 *   7. **Staging env scoped** — `[env.staging]` + `[env.staging.vars]`
 *      with `ENVIRONMENT = "staging"` (prevents staging-overwrites-prod).
 *   8. **Build command uses worker tsconfig** — `[build].command` invokes
 *      `tsc -p tsconfig.worker.json` (cross-edge with tsconfig family #18).
 *
 * Novel invariants locked (family #20):
 *   - **Cloudflare-specific deploy substrate** — TOML format + wrangler
 *     semantics (vs generic YAML of CI/compose/alerts).
 *   - **Entry-point existence coupling** — `main` TS file must exist (like
 *     #176 CI-script ref but for worker substrate).
 *   - **Env-scoping discipline** — production `[vars]` + `[env.staging]`
 *     separation; staging must override production (otherwise staging
 *     deploy overwrites production worker).
 *   - **Compatibility date sanity** — not far-future (unsupported),
 *     not ancient (breaking APIs).
 *
 * Drift scenarios covered:
 *   - Developer renames `main` to non-existent file → case 2 fails.
 *   - `nodejs_compat` dropped → case 4 fails (Node stdlib would silently
 *     404 at runtime).
 *   - Production vars changes `ENVIRONMENT = "dev"` → case 6 fails.
 *   - Staging env deleted → case 7 fails (staging deploys overwrite prod).
 *   - Build command changes to main tsconfig → case 8 fails (tsc
 *     compiles wrong source set).
 *
 * Symmetric to prior integrity edges:
 *   #176 CI-script file existence (same "ref must resolve on disk"
 *   pattern, different substrate), #177 tsconfig.worker.json (Build
 *   command here points to that tsconfig — cross-edge coupling).
 *
 * Opens the **36th integrity edge — HEXTRIACONTAGON** (36-gon). First
 * Wrangler Cloudflare-deploy discipline edge. Novel family #20.
 * Integrity pentatriacontagon → hextriacontagon (36-gon). Pillar 4
 * SDLC Cloudflare-deploy substrate now sync-validated — worker deploy
 * can't silently drift without CI failure.
 *
 * Non-goals: validating KV namespace `id` hex format exhaustively,
 * asserting `compatibility_date` exact value (tunable), locking
 * custom domain `routes` (commented out today — YAGNI).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const WRANGLER_PATH = resolve(REPO_ROOT, 'wrangler.toml');

const EXPECTED_NAME = 'algo-trader';
const EXPECTED_ENVIRONMENT_PROD = 'production';
const EXPECTED_ENVIRONMENT_STAGING = 'staging';
const EXPECTED_COMPAT_FLAG = 'nodejs_compat';
const EXPECTED_BUILD_CMD_FRAGMENT = 'tsconfig.worker.json';
const MIN_COMPAT_YEAR = 2024;
const MAX_COMPAT_YEAR = 2026; // current-year + 1 — prevents future-dated drift

/** Extract a top-level string key = "value" from TOML content. */
function extractTopLevelString(src: string, key: string): string | null {
  const re = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm');
  const m = re.exec(src);
  return m ? m[1] : null;
}

/** Extract a TOML string array (top-level): `key = ["a", "b"]`. */
function extractTopLevelArray(src: string, key: string): string[] | null {
  const re = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]+)\\]`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/**
 * Extract a `[section]` block body (up to next `[` line or EOF).
 * JS regex `\Z` isn't supported — use lookahead to `\n[` or fall through.
 */
function extractSection(src: string, sectionName: string): string | null {
  const re = new RegExp(
    `^\\[${sectionName.replace(/\./g, '\\.')}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\[|$)`,
    'm',
  );
  const m = re.exec(src);
  return m ? m[1] : null;
}

/** Extract a key=value from within a pre-extracted section body. */
function extractSectionKey(body: string, key: string): string | null {
  const re = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm');
  const m = re.exec(body);
  return m ? m[1] : null;
}

describe('Wrangler Cloudflare-deploy discipline — 36th edge (HEXTRIACONTAGON)', () => {
  const raw = readFileSync(WRANGLER_PATH, 'utf8');

  it(`worker name pinned to '${EXPECTED_NAME}'`, () => {
    const name = extractTopLevelString(raw, 'name');
    expect(name, 'wrangler.toml top-level `name` missing').not.toBeNull();
    expect(name).toBe(EXPECTED_NAME);
  });

  it('`main` entry point exists on disk', () => {
    const main = extractTopLevelString(raw, 'main');
    expect(main, 'wrangler.toml top-level `main` missing').not.toBeNull();
    const mainPath = resolve(REPO_ROOT, main!);
    expect(
      existsSync(mainPath),
      `wrangler.toml main='${main}' does not exist on disk — deploy would build empty worker`,
    ).toBe(true);
  });

  it(`compatibility_date is in range [${MIN_COMPAT_YEAR}, ${MAX_COMPAT_YEAR}] (not future-dated, not ancient)`, () => {
    const date = extractTopLevelString(raw, 'compatibility_date');
    expect(date, 'compatibility_date missing').not.toBeNull();
    const yearM = /^(\d{4})-\d{2}-\d{2}$/.exec(date!);
    expect(yearM, `compatibility_date='${date}' not ISO YYYY-MM-DD`).not.toBeNull();
    const year = parseInt(yearM![1], 10);
    expect(year).toBeGreaterThanOrEqual(MIN_COMPAT_YEAR);
    expect(year).toBeLessThanOrEqual(MAX_COMPAT_YEAR);
  });

  it(`compatibility_flags includes '${EXPECTED_COMPAT_FLAG}' (Node stdlib)`, () => {
    const flags = extractTopLevelArray(raw, 'compatibility_flags');
    expect(flags, 'compatibility_flags missing').not.toBeNull();
    expect(
      flags!.includes(EXPECTED_COMPAT_FLAG),
      `compatibility_flags=${JSON.stringify(flags)} missing '${EXPECTED_COMPAT_FLAG}' — Node stdlib APIs would silently 404 at runtime`,
    ).toBe(true);
  });

  it('KV namespace declared with binding + id + preview_id (non-empty)', () => {
    // [[kv_namespaces]] is TOML array-of-tables.
    const kvBlockM = /\[\[kv_namespaces\]\]\s*\n([\s\S]*?)(?=\n\[|$)/.exec(raw);
    expect(
      kvBlockM,
      'wrangler.toml missing [[kv_namespaces]] array-of-tables block',
    ).not.toBeNull();
    const body = kvBlockM![1];
    expect(/^binding\s*=\s*"[^"]+"/m.test(body), 'KV binding missing').toBe(true);
    expect(/^id\s*=\s*"[a-f0-9]+"/m.test(body), 'KV id missing or non-hex').toBe(
      true,
    );
    expect(
      /^preview_id\s*=\s*"[a-f0-9]+"/m.test(body),
      'KV preview_id missing',
    ).toBe(true);
  });

  it(`production [vars].ENVIRONMENT = '${EXPECTED_ENVIRONMENT_PROD}'`, () => {
    const varsBody = extractSection(raw, 'vars');
    expect(varsBody, 'wrangler.toml missing [vars] section').not.toBeNull();
    const env = extractSectionKey(varsBody!, 'ENVIRONMENT');
    expect(env).toBe(EXPECTED_ENVIRONMENT_PROD);
  });

  it(`[env.staging] present with name + ENVIRONMENT = '${EXPECTED_ENVIRONMENT_STAGING}'`, () => {
    const stagingBody = extractSection(raw, 'env.staging');
    expect(
      stagingBody,
      'wrangler.toml missing [env.staging] section — staging deploys would overwrite production',
    ).not.toBeNull();
    const stagingName = extractSectionKey(stagingBody!, 'name');
    expect(
      stagingName,
      '[env.staging].name missing — staging deploy target name unset',
    ).not.toBeNull();
    // Staging vars are in [env.staging.vars] — separate section.
    const stagingVarsBody = extractSection(raw, 'env.staging.vars');
    expect(
      stagingVarsBody,
      'wrangler.toml missing [env.staging.vars] section',
    ).not.toBeNull();
    const stagingEnv = extractSectionKey(stagingVarsBody!, 'ENVIRONMENT');
    expect(stagingEnv).toBe(EXPECTED_ENVIRONMENT_STAGING);
  });

  it(`[build].command uses '${EXPECTED_BUILD_CMD_FRAGMENT}' (cross-edge with tsconfig family #18)`, () => {
    const buildBody = extractSection(raw, 'build');
    expect(buildBody, 'wrangler.toml missing [build] section').not.toBeNull();
    const cmd = extractSectionKey(buildBody!, 'command');
    expect(cmd, '[build].command missing').not.toBeNull();
    expect(
      cmd!.includes(EXPECTED_BUILD_CMD_FRAGMENT),
      `[build].command='${cmd}' does not reference '${EXPECTED_BUILD_CMD_FRAGMENT}' — worker compiles against wrong source set (full src/** instead of worker subset)`,
    ).toBe(true);
  });

  it('tsconfig.worker.json exists on disk (build-command precondition)', () => {
    const p = resolve(REPO_ROOT, 'tsconfig.worker.json');
    expect(
      existsSync(p),
      'tsconfig.worker.json missing on disk — wrangler build command would fail; cross-edge precondition with family #18',
    ).toBe(true);
  });

  it('composite 8-axis discipline integrity (all load-bearing invariants fire)', () => {
    // Meta-sanity: all 8 novel family-#20 invariants hold simultaneously.
    expect(extractTopLevelString(raw, 'name')).toBe(EXPECTED_NAME);
    const main = extractTopLevelString(raw, 'main');
    expect(existsSync(resolve(REPO_ROOT, main!))).toBe(true);
    const date = extractTopLevelString(raw, 'compatibility_date');
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const flags = extractTopLevelArray(raw, 'compatibility_flags');
    expect(flags!.includes(EXPECTED_COMPAT_FLAG)).toBe(true);
    const varsBody = extractSection(raw, 'vars');
    expect(extractSectionKey(varsBody!, 'ENVIRONMENT')).toBe(EXPECTED_ENVIRONMENT_PROD);
    const stagingVarsBody = extractSection(raw, 'env.staging.vars');
    expect(extractSectionKey(stagingVarsBody!, 'ENVIRONMENT')).toBe(EXPECTED_ENVIRONMENT_STAGING);
    const buildBody = extractSection(raw, 'build');
    expect(extractSectionKey(buildBody!, 'command')!.includes(EXPECTED_BUILD_CMD_FRAGMENT)).toBe(true);
  });

  it('no accidental ENVIRONMENT leak — production+staging values distinct', () => {
    // Meta-check: production and staging ENVIRONMENT values must differ.
    // If both are "production" (typo), staging deploy would tag as production.
    const varsBody = extractSection(raw, 'vars');
    const stagingVarsBody = extractSection(raw, 'env.staging.vars');
    const prod = extractSectionKey(varsBody!, 'ENVIRONMENT');
    const staging = extractSectionKey(stagingVarsBody!, 'ENVIRONMENT');
    expect(
      prod !== staging,
      `production ENVIRONMENT='${prod}' and staging ENVIRONMENT='${staging}' are IDENTICAL — staging deploys would tag as production; operator cannot distinguish at runtime`,
    ).toBe(true);
  });
});
