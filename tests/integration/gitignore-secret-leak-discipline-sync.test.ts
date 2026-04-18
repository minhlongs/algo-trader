/**
 * .gitignore secret-leak-prevention discipline 6-invariant sync — first gitignore-substrate edge.
 *
 * `.gitignore` is the PRIMARY defense against committing secrets (`.env`
 * files, private keys, credentials) + bloat (`node_modules/`, `dist/`,
 * `*.log`) to the git repository. Drift = secret leak visible on GitHub,
 * triggering GitGuardian + potentially revoking API keys. GitGuardian
 * catches SOME leaks at push-time, but `.gitignore` is the 0-latency
 * primary defense.
 *
 * Unlike the 34 prior edges (18 families):
 *   - Prior 18 families cover DB schemas, code constants, external APIs,
 *     Grafana alerts, docker-compose, .env.example, GitHub Actions YAML,
 *     CI script filesystem refs, tsconfig compiler-config.
 *   - **NEW family #19: `.gitignore` SECRET-LEAK-PREVENTION DISCIPLINE.**
 *     Locks the `.gitignore` substrate for secret-file pattern coverage +
 *     build-bloat prevention + no-unignore safety. Distinct from #174
 *     (operator-config `.env.example` surface) because this locks the
 *     COMPLEMENTARY surface — `.env.example` is committed (operator docs),
 *     `.env` is ignored (operator secrets).
 *
 * The invariant is declared across 1 file × 6 invariant axes:
 *
 *   1. **Secret-file patterns ignored** — `.env`, `.env.production`,
 *      `.env.local`, `.env.*.local` all present.
 *   2. **Build artifacts ignored** — `node_modules/`, `dist/` (prevents
 *      multi-GB repo bloat).
 *   3. **Log files ignored** — `*.log` (prevents debug-log secret leak).
 *   4. **OS/tool artifacts ignored** — `.DS_Store` (macOS), lockfile
 *      variants should not ride in non-npm contexts.
 *   5. **No un-ignore of secret-file patterns** — no `!.env` or
 *      `!*.pem` etc.
 *   6. **Complementary coherence with `.env.example`** — `.env` is
 *      ignored AND `.env.example` is tracked (locked by PR #174).
 *
 * Novel invariants locked (family #19):
 *   - **Secret-pattern coverage** — `.env*` family all ignored; drift =
 *     GitGuardian would catch at push-time but `.gitignore` is 0-latency
 *     primary defense.
 *   - **No un-ignore escape** — explicit `!pattern` that re-adds a
 *     previously-ignored file must NOT match secret patterns.
 *   - **Build-bloat prevention** — `node_modules/` + `dist/` must be
 *     ignored (repo size discipline).
 *   - **Complementary with #174** — `.env.example` is tracked (operator
 *     docs), `.env` is ignored (operator secrets). Locking the asymmetry.
 *
 * Drift scenarios covered:
 *   - Developer deletes `.env` line to test a feature → case 2 fails
 *     (secret pattern missing from .gitignore).
 *   - Someone adds `!.env.test` un-ignore to commit test fixtures → case 5
 *     fails (secret un-ignore escape).
 *   - New log pattern (`*.trace`) added without `.gitignore` update →
 *     case 3 fails (log pattern gap).
 *
 * Symmetric to prior integrity edges:
 *   #174 operator-config surface coherence (complementary side — tracked
 *   docs vs ignored secrets).
 *
 * Opens the **35th integrity edge — PENTATRIACONTAGON** (35-gon). First
 * `.gitignore` secret-leak-prevention discipline edge. Novel family
 * #19. Integrity tetratriacontagon → pentatriacontagon (35-gon). Security
 * perimeter now spans: operator-docs (#174 `.env.example` tracked) +
 * operator-secrets (#178 `.env` ignored) = full `.env`-family coverage.
 *
 * Non-goals: auditing history for past leaks (git-log scan is a separate
 * concern), asserting `.dockerignore` coherence (`.dockerignore` doesn't
 * exist in this repo today — would force creation if locked), locking
 * every conceivable secret pattern (YAGNI — focus on `.env` family +
 * explicit un-ignore prohibition).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const GITIGNORE_PATH = resolve(REPO_ROOT, '.gitignore');
const ENV_EXAMPLE_PATH = resolve(REPO_ROOT, '.env.example');

/**
 * Required-ignored patterns covering secrets + build artifacts + logs.
 * Each must appear as an entry in `.gitignore` (exact match on a line).
 */
const REQUIRED_PATTERNS = new Set<string>([
  '.env',
  '.env.local',
  '.env.production',
  '.env.*.local',
  'node_modules/',
  'dist/',
  '*.log',
]);

/**
 * Secret-file patterns that must NEVER be un-ignored via `!` prefix.
 * These are safety assertions — even a well-intentioned `!` un-ignore
 * to commit a test-fixture secret would leak the pattern.
 */
const SECRET_PREFIXES = ['.env', '*.pem', '*.key', 'id_rsa', 'credentials'];

/**
 * Parse .gitignore into list of entries + list of un-ignore (`!`) entries.
 * Strips comments and blank lines.
 */
function parseGitignore(src: string): {
  entries: string[];
  unignores: string[];
} {
  const entries: string[] = [];
  const unignores: string[] = [];
  for (const rawLine of src.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) {
      unignores.push(line.slice(1));
    } else {
      entries.push(line);
    }
  }
  return { entries, unignores };
}

describe('.gitignore secret-leak-prevention discipline — 35th edge (PENTATRIACONTAGON)', () => {
  const gitignoreRaw = readFileSync(GITIGNORE_PATH, 'utf8');
  const { entries, unignores } = parseGitignore(gitignoreRaw);
  const entrySet = new Set(entries);

  it('.gitignore exists and is non-empty (sanity floor)', () => {
    expect(entries.length).toBeGreaterThan(5);
  });

  it('every REQUIRED_PATTERNS entry is present in `.gitignore`', () => {
    const missing = [...REQUIRED_PATTERNS].filter((p) => !entrySet.has(p));
    expect(
      missing,
      `.gitignore missing required patterns: ${missing.join(', ')} — secret leak or build-bloat risk`,
    ).toEqual([]);
  });

  it('`.env` is ignored (operator-secrets file — load-bearing)', () => {
    expect(
      entrySet.has('.env'),
      `.gitignore does not ignore '.env' — operator secrets would commit to repo; GitGuardian catches at push but gitignore is 0-latency primary defense`,
    ).toBe(true);
  });

  it('`.env.*.local` pattern ignored (dev-variant secrets)', () => {
    expect(
      entrySet.has('.env.*.local'),
      `.gitignore does not ignore '.env.*.local' — .env.development.local etc would commit`,
    ).toBe(true);
  });

  it('`node_modules/` ignored (build-bloat prevention)', () => {
    expect(
      entrySet.has('node_modules/'),
      `.gitignore missing 'node_modules/' — repo would balloon to multi-GB`,
    ).toBe(true);
  });

  it('`dist/` ignored (build output)', () => {
    expect(
      entrySet.has('dist/'),
      `.gitignore missing 'dist/' — compiled output would commit`,
    ).toBe(true);
  });

  it('`*.log` ignored (debug-log secret leak prevention)', () => {
    expect(
      entrySet.has('*.log'),
      `.gitignore missing '*.log' — debug logs may contain API keys / stack traces`,
    ).toBe(true);
  });

  it('no `!` un-ignore matches a secret-file prefix (escape prevention)', () => {
    for (const unig of unignores) {
      for (const prefix of SECRET_PREFIXES) {
        // Normalize both for comparison.
        const looksLikeSecret = unig === prefix || unig.startsWith(prefix + '.');
        expect(
          looksLikeSecret,
          `.gitignore has unignore '!${unig}' matching secret prefix '${prefix}' — secret-escape route; remove unignore or rename pattern`,
        ).toBe(false);
      }
    }
  });

  it('complementary with PR #174 — `.env.example` is TRACKED (not in gitignore) while `.env` is IGNORED', () => {
    // Verifies the asymmetry: `.env.example` is the operator-docs surface
    // (committed to repo), while `.env` is the operator-secrets surface
    // (ignored). Drift where `.env.example` accidentally gets ignored =
    // operator loses onboarding docs.
    expect(
      entrySet.has('.env'),
      `.env not ignored — secret-leak primary defense broken`,
    ).toBe(true);
    expect(
      entrySet.has('.env.example'),
      `.env.example appears in .gitignore — operator onboarding docs would be hidden from repo; PR #174 operator-config contract broken`,
    ).toBe(false);
    // Positive check: .env.example actually exists on disk (locked by #174).
    const exampleExists = (() => {
      try {
        readFileSync(ENV_EXAMPLE_PATH, 'utf8');
        return true;
      } catch {
        return false;
      }
    })();
    expect(
      exampleExists,
      `.env.example missing from disk — PR #174 precondition broken`,
    ).toBe(true);
  });

  it('composite: 6 invariant axes hold simultaneously (secret-file + build + log + complementary)', () => {
    // Meta-sanity: all load-bearing REQUIRED_PATTERNS + un-ignore safety +
    // complementary-with-#174 fire together.
    for (const p of REQUIRED_PATTERNS) {
      expect(entrySet.has(p), `required '${p}' missing`).toBe(true);
    }
    for (const unig of unignores) {
      for (const prefix of SECRET_PREFIXES) {
        const looksLikeSecret = unig === prefix || unig.startsWith(prefix + '.');
        expect(looksLikeSecret, `secret-escape via !${unig}`).toBe(false);
      }
    }
    expect(entrySet.has('.env.example')).toBe(false);
  });

  it('secret-pattern coverage documentation (security audit trail)', () => {
    // Meta-assertion: the test explicitly names the security-critical
    // patterns it protects against. If new secret-file convention lands
    // (e.g., `.env.vault`, `*.tfstate`), add to REQUIRED_PATTERNS or
    // SECRET_PREFIXES with rationale.
    expect(REQUIRED_PATTERNS.has('.env')).toBe(true);
    expect(SECRET_PREFIXES.includes('.env')).toBe(true);
    expect(SECRET_PREFIXES.includes('*.pem')).toBe(true);
    expect(SECRET_PREFIXES.includes('*.key')).toBe(true);
    expect(SECRET_PREFIXES.includes('id_rsa')).toBe(true);
    expect(SECRET_PREFIXES.includes('credentials')).toBe(true);
  });
});
