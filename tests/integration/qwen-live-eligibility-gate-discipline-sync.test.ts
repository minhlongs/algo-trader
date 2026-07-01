/**
 * Qwen live-eligibility gate discipline 10-invariant sync — L4/L4b
 * paper-gate substrate edge.
 *
 * `src/desk/wiring/qwen-live-eligibility-gate.ts` enforces the paper-gate
 * before any Qwen signal can touch live money:
 *   - L4: MIN_PAPER_DAYS = 30 (HARDCODED — not env-overridable)
 *   - L4b: QWEN_AUTO_APPROVE_MAX_USD = 500 (env, default 500)
 *   - QWEN_LIVE_ELIGIBLE === 'true' (human flip required)
 *
 * Drift manifests as:
 *   - `MIN_PAPER_DAYS` made env-configurable → operator shortcut skips
 *     the 30-day validation → live trading before paper-proof
 *   - `QWEN_LIVE_ELIGIBLE !== 'false'` inversion → default acceptance
 *     flips live-by-default (operator-safety CRITICAL)
 *   - PaperGateError statusCode drifts from 403 → 500 → error handler
 *     upgrades to crash instead of operator-actionable response
 *   - SQL query omits `source = 'qwen'` filter → counts every paper
 *     trade → 30d cleared prematurely on first paper trade of ANY source
 *
 * Unlike the 53 prior edges (37 families):
 *   - #196 locks drawdown-monitor wiring (L3 — runtime rollback).
 *   - **NEW family #38: QWEN LIVE-ELIGIBILITY GATE DISCIPLINE.** L4 +
 *     L4b paper-gate. Paper → Live transition invariant.
 *
 * The invariant is declared across 1 file × 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **MIN_PAPER_DAYS = 30 HARDCODED const** — NOT env-sourced.
 *   3. **MIN_PAPER_MS derived** — `MIN_PAPER_DAYS * 24 * 60 * 60 * 1000`.
 *   4. **QWEN_AUTO_APPROVE_MAX_USD env + 500 default** —
 *      `parseFloat || 500` with `isNaN ? 500 : parsed` fallback chain.
 *   5. **QWEN_LIVE_ELIGIBLE exact `=== 'true'` strict compare** —
 *      inversion-lock.
 *   6. **PaperGateError class with statusCode=403 readonly** —
 *      operator-actionable gate rejection (not 500 crash).
 *   7. **assertQwenLiveEligible(sizeUsd) throws PaperGateError** —
 *      public enforcement API.
 *   8. **getQwenFirstTradeAgeMs SQL filters `source = 'qwen'`** —
 *      prevents counting non-Qwen paper history.
 *   9. **setQwenPaperGateDaysRemaining metric emission** — operator
 *      dashboard contract.
 *  10. **EligibilityResult interface exported** with eligible +
 *      reason + firstTradeAgeMs + requiresManualApproval fields.
 *
 * Novel invariants locked (family #38):
 *   - **Hardcoded MIN_PAPER_DAYS** — any pressure to move to env
 *     breaks the paper-validation invariant.
 *   - **Strict `=== 'true'` eligibility** — inversion-lock prevents
 *     default-live slip.
 *   - **403 error class** — distinguishes operator-gate rejection
 *     from crash class.
 *   - **source='qwen' filter** — paper-history counting scoped to
 *     Qwen source only.
 *
 * Drift scenarios covered:
 *   - Developer migrates MIN_PAPER_DAYS to env for "config flexibility"
 *     → case 2 fails.
 *   - Eligibility check changed to `!== 'false'` → case 5 fails (live
 *     by default).
 *   - SQL filter dropped in refactor → case 8 fails (30d cleared
 *     prematurely).
 *   - PaperGateError statusCode drifts to 500 → case 6 fails.
 *
 * Symmetric to prior integrity edges:
 *   #174 env-var operator-knob coherence (consumer of
 *   QWEN_LIVE_ELIGIBLE + QWEN_AUTO_APPROVE_MAX_USD).
 *   #195 admin kill-switch (complementary — admin surface uses
 *   checkQwenEligibility).
 *   #196 drawdown-monitor wiring (L3 runtime rollback, L4 this edge
 *   is pre-live gate).
 *
 * Opens the **54th integrity edge — TETRAPENTACONTAGON** (54-gon). L4
 * paper-gate substrate edge. Novel family #38. Integrity
 * tripentacontagon → tetrapentacontagon (54-gon).
 *
 * Non-goals: Telegram notification shape (separate module); SQL result
 * error-path integration (covered elsewhere); exact EligibilityResult
 * reason strings (operator-readable, not contract-level).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const GATE_FILE = resolve(REPO_ROOT, 'src/desk/wiring/qwen-live-eligibility-gate.ts');

const EXPECTED_MIN_PAPER_DAYS = 30;
const EXPECTED_AUTO_APPROVE_DEFAULT_USD = 500;

function readGate(): string {
  return readFileSync(GATE_FILE, 'utf8');
}

describe('Qwen live-eligibility gate discipline — 54th edge (TETRAPENTACONTAGON)', () => {
  const src = readGate();

  it('qwen-live-eligibility-gate.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(800);
  });

  it(`MIN_PAPER_DAYS = ${EXPECTED_MIN_PAPER_DAYS} HARDCODED const (NOT env-sourced)`, () => {
    const re = new RegExp(`const\\s+MIN_PAPER_DAYS\\s*=\\s*${EXPECTED_MIN_PAPER_DAYS}\\b`);
    expect(
      re.test(src),
      `MIN_PAPER_DAYS must equal ${EXPECTED_MIN_PAPER_DAYS} as a hardcoded const — not env-configurable`,
    ).toBe(true);
    // Inversion-defense: MIN_PAPER_DAYS must NOT reference process.env on its RHS.
    const envRe = /const\s+MIN_PAPER_DAYS\s*=\s*[^;\n]*process\.env/;
    expect(
      envRe.test(src),
      'MIN_PAPER_DAYS became env-sourced — operator could shortcut paper validation',
    ).toBe(false);
  });

  it('MIN_PAPER_MS derived from MIN_PAPER_DAYS (explicit conversion)', () => {
    expect(
      /MIN_PAPER_MS\s*=\s*MIN_PAPER_DAYS\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src),
      'MIN_PAPER_MS not derived as MIN_PAPER_DAYS * 24 * 60 * 60 * 1000',
    ).toBe(true);
  });

  it(`QWEN_AUTO_APPROVE_MAX_USD env + ${EXPECTED_AUTO_APPROVE_DEFAULT_USD} default fallback chain`, () => {
    expect(
      /process\.env\.QWEN_AUTO_APPROVE_MAX_USD/.test(src),
      'QWEN_AUTO_APPROVE_MAX_USD env not read',
    ).toBe(true);
    const defRe = new RegExp(
      `parseFloat\\(raw\\)\\s*:\\s*${EXPECTED_AUTO_APPROVE_DEFAULT_USD}\\b`,
    );
    const nanRe = new RegExp(
      `isNaN\\(parsed\\)\\s*\\?\\s*${EXPECTED_AUTO_APPROVE_DEFAULT_USD}\\b`,
    );
    expect(
      defRe.test(src) || nanRe.test(src),
      `QWEN_AUTO_APPROVE_MAX_USD default must be ${EXPECTED_AUTO_APPROVE_DEFAULT_USD} USD — drift widens auto-approve silently`,
    ).toBe(true);
  });

  it("QWEN_LIVE_ELIGIBLE strict `=== 'true'` compare (inversion-lock)", () => {
    expect(
      /process\.env\.QWEN_LIVE_ELIGIBLE\s*!==\s*['"]true['"]/.test(src),
      `QWEN_LIVE_ELIGIBLE check must compare !== 'true' (gate-by-default) — drift to !== 'false' flips to live-by-default`,
    ).toBe(true);
  });

  it('PaperGateError class with statusCode = 403 readonly + name=PaperGateError', () => {
    expect(
      /export\s+class\s+PaperGateError\s+extends\s+Error/.test(src),
      'PaperGateError class not exported',
    ).toBe(true);
    expect(
      /readonly\s+statusCode\s*=\s*403/.test(src),
      'PaperGateError.statusCode must be 403 readonly — operator-actionable; 500 drift = crash class',
    ).toBe(true);
    expect(
      /this\.name\s*=\s*['"]PaperGateError['"]/.test(src),
      'PaperGateError.name not set to "PaperGateError" — instanceof check via name broken',
    ).toBe(true);
  });

  it('assertQwenLiveEligible(sizeUsd: number) exported as async + throws PaperGateError', () => {
    expect(
      /export\s+async\s+function\s+assertQwenLiveEligible\s*\(\s*sizeUsd\s*:\s*number\s*\)\s*:\s*Promise<void>/.test(
        src,
      ),
      'assertQwenLiveEligible(sizeUsd: number): Promise<void> signature drifted',
    ).toBe(true);
    expect(
      /throw\s+new\s+PaperGateError\(/.test(src),
      'assertQwenLiveEligible does not throw PaperGateError — gate enforcement broken',
    ).toBe(true);
  });

  it("getQwenFirstTradeAgeMs SQL filters `source = $1` with 'qwen'", () => {
    expect(
      /FROM\s+paper_trades_v3\s+WHERE\s+source\s*=\s*\$1/i.test(src),
      "SQL query missing WHERE source = $1 filter — counts every paper trade, 30d cleared prematurely",
    ).toBe(true);
    expect(
      /\[['"]qwen['"]\]/.test(src),
      "SQL parameter missing ['qwen'] — source filter would bind undefined",
    ).toBe(true);
  });

  it('setQwenPaperGateDaysRemaining metric emission (operator dashboard)', () => {
    expect(
      /setQwenPaperGateDaysRemaining\(/.test(src),
      'setQwenPaperGateDaysRemaining metric not emitted — operator dashboard `days until live` broken',
    ).toBe(true);
  });

  it('EligibilityResult interface exported with required fields', () => {
    expect(
      /export\s+interface\s+EligibilityResult\s*\{/.test(src),
      'EligibilityResult interface not exported',
    ).toBe(true);
    for (const field of ['eligible', 'reason', 'firstTradeAgeMs', 'requiresManualApproval']) {
      const re = new RegExp(`\\b${field}\\?\\s*:\\s*\\w+|\\b${field}\\s*:\\s*\\w+`);
      expect(re.test(src), `EligibilityResult.${field} field missing`).toBe(true);
    }
  });

  it('composite: 10 axes hold simultaneously (paper-gate coherence)', () => {
    expect(new RegExp(`const\\s+MIN_PAPER_DAYS\\s*=\\s*${EXPECTED_MIN_PAPER_DAYS}\\b`).test(src)).toBe(true);
    expect(/const\s+MIN_PAPER_DAYS\s*=\s*[^;\n]*process\.env/.test(src)).toBe(false);
    expect(/MIN_PAPER_MS\s*=\s*MIN_PAPER_DAYS\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src)).toBe(true);
    expect(/process\.env\.QWEN_AUTO_APPROVE_MAX_USD/.test(src)).toBe(true);
    expect(/process\.env\.QWEN_LIVE_ELIGIBLE\s*!==\s*['"]true['"]/.test(src)).toBe(true);
    expect(/readonly\s+statusCode\s*=\s*403/.test(src)).toBe(true);
    expect(/export\s+async\s+function\s+assertQwenLiveEligible/.test(src)).toBe(true);
    expect(/WHERE\s+source\s*=\s*\$1/i.test(src)).toBe(true);
    expect(/setQwenPaperGateDaysRemaining\(/.test(src)).toBe(true);
    expect(/export\s+interface\s+EligibilityResult/.test(src)).toBe(true);
  });
});
