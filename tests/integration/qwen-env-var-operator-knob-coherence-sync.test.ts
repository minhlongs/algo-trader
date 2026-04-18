/**
 * Qwen env-var operator-knob coherence 4-invariant sync — first operator-facing config surface edge.
 *
 * The Qwen Solo Platform exposes a set of env vars that operators tune at
 * deploy time: L1 kill switch (`QWEN_KILL`), L3 drawdown threshold
 * (`QWEN_DRAWDOWN_MAX_PCT`), L4 paper-gate flag (`QWEN_LIVE_ELIGIBLE`),
 * signal-ingest HMAC secret (`QWEN_INGEST_HMAC_SECRET`), and trade-size
 * cap (`QWEN_AUTO_APPROVE_MAX_USD`). These are CRITICAL operator knobs —
 * an operator reading `.env.example` must see every one of them so they
 * can configure the system correctly. Drift where `.env.example` omits
 * a critical knob = operator deploys with unintended defaults (L3
 * threshold at compiled-in 5% instead of policy-intended 3%, for
 * example).
 *
 * Unlike the 30 prior edges:
 *   - Prior 14 families span DB schemas, code constants, external APIs,
 *     Grafana alerts, docker-compose service graph.
 *   - **NEW family #15: OPERATOR-FACING CONFIGURATION SURFACE COHERENCE.**
 *     Locks the bidirectional contract between `.env.example` (the
 *     documentation operators see) and `process.env.X` reads in code (the
 *     actual consumers). Distinct from #169 (external-API shape) because
 *     the "contract" here is between TWO INTERNAL surfaces — doc file
 *     and code reads — not between code and a third-party API.
 *
 * Scoping: this edge locks a narrow CRITICAL_OPERATOR_KNOB set (5 vars)
 * rather than every `process.env.QWEN_*` read. Rationale: tuning vars
 * (e.g., `QWEN_REVIEW_WIN_RATE_MIN`) have sensible code-level defaults;
 * documenting them in `.env.example` is nice-to-have, not critical.
 * CRITICAL knobs define the L1/L3/L4 rollback doctrine boundaries +
 * HMAC auth + trade-size cap — operator MUST know these exist.
 *
 * The coherence is declared across 2 surfaces × 2 invariant axes = 4 invariants:
 *
 *   1. **`.env.example`** — `/.env.example` declares every CRITICAL_OPERATOR_KNOB
 *      with a placeholder value (not a real secret).
 *   2. **`process.env.X` reads** — every CRITICAL_OPERATOR_KNOB is read by at
 *      least one wiring module (not just documented, actually consumed).
 *   3. **Bidirectional subset** — the overlap (∩) of env-example + code-read
 *      sets must contain all CRITICAL_OPERATOR_KNOBs.
 *   4. **Placeholder discipline** — `.env.example` values for sensitive keys
 *      (HMAC_SECRET) use placeholder patterns (hex-placeholder or explicit
 *      "your-*-here" format), not real secrets.
 *
 * Novel invariants locked (family #15):
 *   - **Critical operator knob documentation** — every rollback-tier
 *     knob must be in `.env.example` so operator reads the full L1/L3/L4
 *     palette before deploying.
 *   - **Critical knob consumption** — every critical knob is actually
 *     read by code (not orphan documentation).
 *   - **Naming convention** — all CRITICAL knobs follow `QWEN_*` prefix +
 *     `SCREAMING_SNAKE_CASE`.
 *   - **Placeholder value discipline** — HMAC_SECRET value in
 *     `.env.example` uses placeholder pattern, not a real hex secret
 *     (which could leak via git).
 *
 * Drift scenarios covered:
 *   - Someone removes `QWEN_DRAWDOWN_MAX_PCT` from `.env.example` →
 *     case 3 fails (bidirectional subset broken).
 *   - Code stops reading `QWEN_KILL` (the L1 kill switch is wired
 *     differently) → case 3 fails.
 *   - A real 64-hex HMAC secret lands in `.env.example` (copy-paste
 *     accident) → case 4 fails (placeholder discipline).
 *   - New critical knob added (e.g., `QWEN_MAX_DAILY_DRAWDOWN_USD`)
 *     without updating `.env.example` → test doesn't auto-detect (not
 *     in CRITICAL_KNOBS set); operator must add it to the constant with
 *     rationale in test update.
 *
 * Symmetric to prior integrity edges:
 *   #145 doc↔code enum (same ↔ pattern on different substrate), #172
 *   YAML alert schema, #173 docker-compose coherence (infra config).
 *
 * Opens the **31st integrity edge — HENITRIACONTAGON** (31-gon). First
 * operator-facing configuration surface coherence edge. Novel family
 * #15. Integrity triacontagon → henitriacontagon (31-gon). Post-
 * TRIACONTAGON extension: after closing the 30-edge perimeter with 14
 * families, this edge opens family #15 on the operator-docs surface —
 * the ONE place the operator reads before deploying the platform.
 *
 * Non-goals: asserting every `process.env.QWEN_*` read is documented
 * in `.env.example` (that would force documenting tuning knobs; YAGNI),
 * validating placeholder-value format BEYOND HMAC_SECRET (other
 * placeholders have varied shapes — YAGNI), or pinning absolute values
 * in `.env.example` (those are tunable defaults, not invariants).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const REPO_ROOT = resolve(__dirname, '../..');
const ENV_EXAMPLE_PATH = resolve(REPO_ROOT, '.env.example');

/**
 * The CRITICAL_OPERATOR_KNOBS set — env vars that MUST appear in BOTH
 * `.env.example` (operator docs) AND `process.env.X` code reads (actual
 * consumers). Any addition here requires coordinated update in both
 * surfaces + this test constant.
 *
 * Rationale per knob:
 *   - QWEN_KILL: L1 kill switch (PDF doctrine L1)
 *   - QWEN_DRAWDOWN_MAX_PCT: L3 auto-disable threshold (PDF doctrine L3)
 *   - QWEN_LIVE_ELIGIBLE: L4 paper-gate toggle (PDF doctrine L4)
 *   - QWEN_INGEST_HMAC_SECRET: signal-ingest auth (Pillar 3 security gate)
 *   - QWEN_AUTO_APPROVE_MAX_USD: trade-size cap (operator-facing safety)
 */
const CRITICAL_OPERATOR_KNOBS = new Set<string>([
  'QWEN_KILL',
  'QWEN_DRAWDOWN_MAX_PCT',
  'QWEN_LIVE_ELIGIBLE',
  'QWEN_INGEST_HMAC_SECRET',
  'QWEN_AUTO_APPROVE_MAX_USD',
]);

/** Naming convention: QWEN_ prefix + SCREAMING_SNAKE_CASE. */
const NAMING_RE = /^QWEN_[A-Z][A-Z0-9_]*$/;

/**
 * Extract all `QWEN_*=...` env var KEYS from `.env.example`. Keys only
 * (not values) for overlap analysis.
 */
function extractEnvExampleKeys(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/^(QWEN_[A-Z0-9_]+)=/gm)) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Extract all `process.env.QWEN_*` read identifiers from source code.
 * Uses grep via execSync for multi-file scan (vitest sandbox allows).
 */
function extractCodeEnvReads(): Set<string> {
  const out = new Set<string>();
  try {
    const cmd = `grep -rhE 'process\\.env\\.QWEN_[A-Z0-9_]+' ${resolve(REPO_ROOT, 'src')} --include='*.ts' 2>/dev/null | grep -oE 'QWEN_[A-Z0-9_]+' | sort -u`;
    const stdout = execSync(cmd, { encoding: 'utf8' });
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) out.add(trimmed);
    }
  } catch {
    // grep exits 1 if no match — return empty set, sanity floor catches.
  }
  return out;
}

/**
 * Extract the value portion of a specific env var from `.env.example`.
 */
function extractEnvExampleValue(src: string, key: string): string | null {
  const re = new RegExp(`^${key}=([^\\n]*)`, 'm');
  const m = re.exec(src);
  return m ? m[1] : null;
}

describe('Qwen env-var operator-knob coherence — 31st edge (HENITRIACONTAGON)', () => {
  const envExample = readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  const envExampleKeys = extractEnvExampleKeys(envExample);
  const codeEnvReads = extractCodeEnvReads();

  it(`.env.example declares at least ${CRITICAL_OPERATOR_KNOBS.size} QWEN_* keys (sanity floor)`, () => {
    expect(
      envExampleKeys.size,
      `.env.example parsed ${envExampleKeys.size} QWEN_* keys — expected ≥ ${CRITICAL_OPERATOR_KNOBS.size}`,
    ).toBeGreaterThanOrEqual(CRITICAL_OPERATOR_KNOBS.size);
  });

  it(`src/**/*.ts reads at least ${CRITICAL_OPERATOR_KNOBS.size} QWEN_* env vars (sanity floor)`, () => {
    expect(
      codeEnvReads.size,
      `code-read QWEN_* count = ${codeEnvReads.size} — expected ≥ ${CRITICAL_OPERATOR_KNOBS.size}`,
    ).toBeGreaterThanOrEqual(CRITICAL_OPERATOR_KNOBS.size);
  });

  it('every CRITICAL_OPERATOR_KNOB appears in `.env.example` (operator-docs discipline)', () => {
    const missing = [...CRITICAL_OPERATOR_KNOBS].filter(
      (k) => !envExampleKeys.has(k),
    );
    expect(
      missing,
      `CRITICAL operator knob(s) missing from .env.example: ${missing.join(', ')} — operator can't see L1/L3/L4 rollback doctrine knobs without docs`,
    ).toEqual([]);
  });

  it('every CRITICAL_OPERATOR_KNOB is read by code in `src/` (consumption discipline)', () => {
    const missing = [...CRITICAL_OPERATOR_KNOBS].filter(
      (k) => !codeEnvReads.has(k),
    );
    expect(
      missing,
      `CRITICAL operator knob(s) not read by any src/*.ts file: ${missing.join(', ')} — orphan documentation; env.example promises a knob that doesn't exist`,
    ).toEqual([]);
  });

  it('every CRITICAL_OPERATOR_KNOB follows QWEN_* SCREAMING_SNAKE_CASE naming', () => {
    for (const k of CRITICAL_OPERATOR_KNOBS) {
      expect(
        NAMING_RE.test(k),
        `CRITICAL knob '${k}' violates QWEN_* SCREAMING_SNAKE_CASE convention`,
      ).toBe(true);
    }
  });

  it('every .env.example QWEN_* key follows QWEN_* SCREAMING_SNAKE_CASE naming', () => {
    const offenders = [...envExampleKeys].filter((k) => !NAMING_RE.test(k));
    expect(
      offenders,
      `.env.example keys violating convention: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('every code-read QWEN_* var follows QWEN_* SCREAMING_SNAKE_CASE naming', () => {
    const offenders = [...codeEnvReads].filter((k) => !NAMING_RE.test(k));
    expect(
      offenders,
      `code-read env keys violating convention: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('QWEN_INGEST_HMAC_SECRET placeholder in .env.example is NOT a real 64-hex secret (placeholder discipline)', () => {
    const val = extractEnvExampleValue(envExample, 'QWEN_INGEST_HMAC_SECRET');
    expect(
      val,
      'QWEN_INGEST_HMAC_SECRET missing from .env.example (case 3 covers, this case documents the placeholder)',
    ).not.toBeNull();
    // Real 64-hex secret would match `^[0-9a-f]{64}$` — placeholder must NOT.
    expect(
      /^[0-9a-f]{64}$/.test(val!.trim()),
      `QWEN_INGEST_HMAC_SECRET='${val}' looks like a real 64-hex secret — placeholder must be obviously-fake (e.g. 'your-64-hex-char-secret-here')`,
    ).toBe(false);
    // Should contain "your" or "example" or "placeholder" hint.
    expect(
      /your|example|placeholder|replace/i.test(val!),
      `QWEN_INGEST_HMAC_SECRET='${val}' should contain a placeholder hint (your/example/placeholder/replace) to signal operators must fill in`,
    ).toBe(true);
  });

  it('CRITICAL_OPERATOR_KNOBS ⊆ (env-example ∩ code-reads) — bidirectional coherence', () => {
    const intersection = new Set<string>(
      [...envExampleKeys].filter((k) => codeEnvReads.has(k)),
    );
    const missing = [...CRITICAL_OPERATOR_KNOBS].filter(
      (k) => !intersection.has(k),
    );
    expect(
      missing,
      `CRITICAL knobs missing from env-example ∩ code-reads intersection: ${missing.join(', ')} — one of the two surfaces dropped the knob`,
    ).toEqual([]);
  });

  it('.env.example and code-reads overlap on all CRITICAL knobs (composite sanity)', () => {
    // Final composite: both sanity floors + bidirectional subset must all hold.
    expect(envExampleKeys.size).toBeGreaterThanOrEqual(
      CRITICAL_OPERATOR_KNOBS.size,
    );
    expect(codeEnvReads.size).toBeGreaterThanOrEqual(
      CRITICAL_OPERATOR_KNOBS.size,
    );
    for (const k of CRITICAL_OPERATOR_KNOBS) {
      expect(envExampleKeys.has(k)).toBe(true);
      expect(codeEnvReads.has(k)).toBe(true);
    }
  });

  it("CRITICAL_OPERATOR_KNOBS covers the L1/L3/L4 doctrine tiers (rollback-knob audit)", () => {
    // Meta-assertion: the CRITICAL set must name the L-tier knobs by
    // semantic content. Rename drift (e.g. QWEN_DRAWDOWN_MAX_PCT →
    // QWEN_DRAWDOWN_THRESHOLD) would fail this check without the author
    // updating the CRITICAL set.
    expect(
      CRITICAL_OPERATOR_KNOBS.has('QWEN_KILL'),
      'CRITICAL set missing L1 kill switch (QWEN_KILL)',
    ).toBe(true);
    expect(
      CRITICAL_OPERATOR_KNOBS.has('QWEN_DRAWDOWN_MAX_PCT'),
      'CRITICAL set missing L3 drawdown threshold (QWEN_DRAWDOWN_MAX_PCT)',
    ).toBe(true);
    expect(
      CRITICAL_OPERATOR_KNOBS.has('QWEN_LIVE_ELIGIBLE'),
      'CRITICAL set missing L4 paper-gate toggle (QWEN_LIVE_ELIGIBLE)',
    ).toBe(true);
  });
});
