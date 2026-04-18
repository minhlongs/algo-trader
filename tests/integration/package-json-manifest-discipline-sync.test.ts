/**
 * package.json manifest discipline 7-invariant sync — first npm-manifest-substrate edge.
 *
 * `package.json` is the PROJECT-ROOT npm manifest — the single source of
 * truth for package identity, dependency set, bin entries, and executable
 * scripts. Drift manifests as published-package breakage (`main` → non-
 * existent file), supply-chain-policy violation (a banned package slips
 * into `dependencies`), or subtle `name`/license churn that breaks
 * downstream consumers (`@mekong/algo-trader` → `@something/else`).
 *
 * Unlike the 36 prior edges (20 families):
 *   - Prior 20 families cover DB schemas, code constants, external APIs,
 *     Grafana alerts, docker-compose, .env.example, GitHub Actions YAML,
 *     CI-script filesystem refs, tsconfig compiler-config, .gitignore,
 *     wrangler.toml. None locks the ROOT `package.json` manifest.
 *   - **NEW family #21: `package.json` MANIFEST DISCIPLINE.**
 *     Locks the npm package-manifest substrate for identity + shape +
 *     supply-chain-policy coherence. Distinct from #176/#177/#179 because
 *     this locks a DIFFERENT JSON shape (npm manifest — not tsconfig, not
 *     Cloudflare Wrangler, not CI-script fs refs).
 *
 * The invariant is declared across 1 file × 7 invariant axes:
 *
 *   1. **Valid JSON** — `package.json` parses (sanity floor).
 *   2. **Pinned package name** — `name === "@mekong/algo-trader"`.
 *      Drift means consumers can't `npm install @mekong/algo-trader`.
 *   3. **Semver version** — `version` matches `MAJOR.MINOR.PATCH`.
 *   4. **Main + bin shape** — `main` is a `dist/...` built-output path;
 *      `bin.algo-trader` + `bin.cashclaw` exist as string paths.
 *   5. **Required scripts** — `build`, `test`, `prepare` all present;
 *      `build` invokes `tsc`; `test` invokes `vitest` or `jest`.
 *   6. **Supply-chain denylist** — no PayPal (`@paypal/*` or `paypal`)
 *      and no Vercel (`@vercel/*` or `vercel`) in dependencies /
 *      devDependencies. Project-level ban via binh-phap-core:
 *      payment-provider.md bans PayPal (Polar.sh primary); binh-phap-cicd
 *      bans Vercel (Cloudflare Pages only).
 *   7. **License + repository coherence** — `license === "MIT"`;
 *      `repository.type === "git"` AND url points to a reachable-by-URL
 *      GitHub path (longtho638-jpg/algo-trader).
 *
 * Novel invariants locked (family #21):
 *   - **Supply-chain denylist enforcement** — PayPal + Vercel bans are
 *     declared in `~/.claude/rules/payment-provider.md` + `binh-phap-
 *     cicd.md` respectively but never enforced at CI time. This edge
 *     catches a drift at `npm install <banned-pkg>` + commit time — before
 *     it reaches merge.
 *   - **Package identity lock** — `name` + `license` + `repository.url`
 *     co-asserted (npm-publish identity triple).
 *   - **Script-harness contract** — `test` MUST invoke vitest or jest
 *     (ensures `npm test` is a REAL test harness, not a no-op).
 *
 * Drift scenarios covered:
 *   - Developer renames package → case 2 fails (pinned name).
 *   - `npm install @paypal/payouts-sdk` → case 6 fails (PayPal ban).
 *   - `npm install vercel --save-dev` → case 6 fails (Vercel ban).
 *   - Accidentally sets `license: "UNLICENSED"` → case 7 fails.
 *   - `scripts.test` → `echo "no tests"` → case 5 fails (harness check).
 *
 * Symmetric to prior integrity edges:
 *   #176 CI-script filesystem-ref existence (complement surface —
 *   CI-workflow scripts vs npm-manifest metadata).
 *   #177 tsconfig compiler-config strict-discipline (same JSON substrate
 *   family but different config semantics).
 *   #179 Wrangler Cloudflare-deploy discipline (complement substrate —
 *   TOML deploy-manifest vs npm package-manifest).
 *
 * Opens the **37th integrity edge — HEPTATRIACONTAGON** (37-gon). First
 * npm-manifest substrate edge. Novel family #21. Integrity hextriacontagon
 * → heptatriacontagon (37-gon). Supply-chain policy now actively
 * enforced — PayPal + Vercel bans graduate from documentation to
 * CI-gated tripwires.
 *
 * Non-goals: auditing transitive dependencies (out-of-scope — npm audit
 * covers CVEs), asserting package-lock.json shape (separate concern),
 * locking every script-ref to an existing file (#176 already locks the
 * CI subset; 4 local-dev scripts reference paths that do not exist on
 * disk but are buildable/generated and not load-bearing for CI).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, 'package.json');

const EXPECTED_NAME = '@mekong/algo-trader';
const EXPECTED_LICENSE = 'MIT';
const EXPECTED_REPO_URL_SUBSTR = 'longtho638-jpg/algo-trader';
const REQUIRED_SCRIPTS = ['build', 'test', 'prepare'] as const;
const REQUIRED_BIN_ENTRIES = ['algo-trader', 'cashclaw'] as const;
const TEST_HARNESS_PATTERN = /\b(vitest|jest)\b/i;
const BUILD_HARNESS_PATTERN = /\btsc\b/i;

/**
 * Supply-chain denylist. Each entry is either an exact package name
 * or a scope prefix. Drift = banned package slipped into the manifest.
 *
 * - `paypal` / `@paypal/*`: BANNED by `~/.claude/rules/payment-provider.md`
 *   (Polar.sh primary + PayOS backup for VN domestic; PayPal removed).
 * - `vercel` / `@vercel/*`: BANNED by `~/.claude/rules/binh-phap-cicd.md`
 *   (Cloudflare Pages only; Vercel eradicated 2026-03-27).
 */
const FORBIDDEN_DEPS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^paypal$/,
    reason: 'PayPal is BANNED — payment-provider.md mandates Polar.sh (primary) + PayOS (VN backup)',
  },
  {
    pattern: /^@paypal\//,
    reason: 'PayPal scope (@paypal/*) is BANNED — payment-provider.md',
  },
  {
    pattern: /^vercel$/,
    reason: 'Vercel is BANNED — binh-phap-cicd.md mandates Cloudflare Pages only',
  },
  {
    pattern: /^@vercel\//,
    reason: 'Vercel scope (@vercel/*) is BANNED — binh-phap-cicd.md',
  },
];

/**
 * Collect every dependency name across `dependencies` + `devDependencies`.
 * Returns Set for O(1) membership checks.
 */
function allDepNames(pkg: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = pkg[field] as Record<string, unknown> | undefined;
    if (block && typeof block === 'object') {
      for (const k of Object.keys(block)) names.add(k);
    }
  }
  return names;
}

describe('package.json manifest discipline — 37th edge (HEPTATRIACONTAGON)', () => {
  const raw = readFileSync(PACKAGE_JSON_PATH, 'utf8');
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw);
  } catch (err) {
    throw new Error(`package.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  it('`package.json` parses as valid JSON (sanity floor)', () => {
    expect(pkg, 'package.json must parse to an object').toBeTruthy();
    expect(typeof pkg).toBe('object');
  });

  it('`name` pinned to @mekong/algo-trader (consumer install identity)', () => {
    expect(
      pkg.name,
      `package.json name must be "${EXPECTED_NAME}" — consumer-install identity; drift breaks npm install paths`,
    ).toBe(EXPECTED_NAME);
  });

  it('`version` matches MAJOR.MINOR.PATCH semver (publish-safety)', () => {
    const version = pkg.version;
    expect(typeof version).toBe('string');
    expect(
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version as string),
      `package.json version "${version}" is not valid semver — npm publish would reject or silently reorder`,
    ).toBe(true);
  });

  it('`main` points at a dist/ built-output path', () => {
    const main = pkg.main;
    expect(typeof main).toBe('string');
    expect(
      (main as string).startsWith('dist/'),
      `package.json main "${main}" must start with "dist/" — published entry point points at built output`,
    ).toBe(true);
  });

  it('`bin` entries (algo-trader + cashclaw) exist as non-empty strings', () => {
    const bin = pkg.bin as Record<string, unknown> | undefined;
    expect(bin, 'package.json.bin block missing — CLI entry points undefined').toBeTruthy();
    for (const entry of REQUIRED_BIN_ENTRIES) {
      const path = bin?.[entry];
      expect(typeof path).toBe('string');
      expect(
        (path as string).length > 0,
        `package.json.bin.${entry} is empty — CLI would not install`,
      ).toBe(true);
    }
  });

  it('`files` array is non-empty and includes "dist" (publish-surface)', () => {
    const files = pkg.files;
    expect(Array.isArray(files)).toBe(true);
    expect((files as unknown[]).length).toBeGreaterThan(0);
    expect(
      (files as unknown[]).includes('dist'),
      'package.json.files must include "dist" — published tarball would miss built output',
    ).toBe(true);
  });

  it('REQUIRED_SCRIPTS (build + test + prepare) all present with sane commands', () => {
    const scripts = pkg.scripts as Record<string, unknown> | undefined;
    expect(scripts, 'package.json.scripts block missing').toBeTruthy();
    for (const name of REQUIRED_SCRIPTS) {
      const cmd = scripts?.[name];
      expect(
        typeof cmd === 'string' && (cmd as string).trim().length > 0,
        `scripts.${name} is missing or empty — developer/CI harness broken`,
      ).toBe(true);
    }
    expect(
      BUILD_HARNESS_PATTERN.test(scripts?.build as string),
      `scripts.build does not invoke tsc — build produces no TypeScript output; actual: ${JSON.stringify(scripts?.build)}`,
    ).toBe(true);
    expect(
      TEST_HARNESS_PATTERN.test(scripts?.test as string),
      `scripts.test must invoke vitest or jest — npm test must be a real harness; actual: ${JSON.stringify(scripts?.test)}`,
    ).toBe(true);
  });

  it('supply-chain denylist: no PayPal or Vercel packages in deps/devDeps', () => {
    const names = allDepNames(pkg);
    const violations: Array<{ name: string; reason: string }> = [];
    for (const name of names) {
      for (const { pattern, reason } of FORBIDDEN_DEPS) {
        if (pattern.test(name)) {
          violations.push({ name, reason });
          break;
        }
      }
    }
    expect(
      violations,
      `Forbidden packages present: ${violations.map((v) => `${v.name} (${v.reason})`).join('; ')}`,
    ).toEqual([]);
  });

  it('`license === "MIT"` (npm-publish identity)', () => {
    expect(
      pkg.license,
      `package.json license must be "${EXPECTED_LICENSE}" — drift breaks npm registry license classifier`,
    ).toBe(EXPECTED_LICENSE);
  });

  it('`repository.type === "git"` AND url resolves to longtho638-jpg/algo-trader (source identity)', () => {
    const repo = pkg.repository as { type?: unknown; url?: unknown } | string | undefined;
    expect(repo, 'package.json.repository missing — npm metadata surface incomplete').toBeTruthy();
    if (typeof repo === 'string') {
      expect(
        repo.includes(EXPECTED_REPO_URL_SUBSTR),
        `repository string "${repo}" must contain "${EXPECTED_REPO_URL_SUBSTR}"`,
      ).toBe(true);
    } else {
      expect(repo?.type).toBe('git');
      expect(typeof repo?.url).toBe('string');
      expect(
        (repo?.url as string).includes(EXPECTED_REPO_URL_SUBSTR),
        `repository.url "${repo?.url}" must contain "${EXPECTED_REPO_URL_SUBSTR}"`,
      ).toBe(true);
    }
  });

  it('composite: 7 invariant axes hold simultaneously (manifest coherence)', () => {
    expect(pkg.name).toBe(EXPECTED_NAME);
    expect(pkg.license).toBe(EXPECTED_LICENSE);
    expect(typeof pkg.version).toBe('string');
    expect((pkg.main as string).startsWith('dist/')).toBe(true);
    const bin = pkg.bin as Record<string, unknown>;
    for (const e of REQUIRED_BIN_ENTRIES) expect(typeof bin[e]).toBe('string');
    const scripts = pkg.scripts as Record<string, unknown>;
    for (const s of REQUIRED_SCRIPTS) expect(typeof scripts[s]).toBe('string');
    const names = allDepNames(pkg);
    for (const { pattern } of FORBIDDEN_DEPS) {
      for (const n of names) expect(pattern.test(n), `forbidden dep "${n}" present`).toBe(false);
    }
  });
});
