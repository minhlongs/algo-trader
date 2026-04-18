/**
 * HMAC verifier implementation discipline 8-invariant sync — second
 * security-critical edge (complementary to #193).
 *
 * `src/utils/hmac-verifier.ts` provides the primitive used by signal-
 * ingest (#193) and any future webhook auth. Drift manifests as:
 *   - `===` comparison instead of `timingSafeEqual` → timing-attack
 *     surface leaks per-byte match info over thousands of requests
 *   - Timestamp window widened beyond 5 minutes → replay-attack window
 *     increases linearly
 *   - sha256= prefix check dropped → bare hex accepted as signature,
 *     downgrade attack
 *   - Buffer-length check omitted before timingSafeEqual → throws
 *     runtime error (Node crash on short signature)
 *
 * Unlike the 50 prior edges (34 families):
 *   - #193 locks the ENDPOINT contract (how HMAC is used).
 *   - **NEW family #35: HMAC VERIFIER IMPLEMENTATION DISCIPLINE.**
 *     Locks the PRIMITIVE itself. Second security-critical edge after
 *     PENTACONTAGON milestone.
 *
 * The invariant is declared across 1 file × 8 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **crypto imports: createHmac + timingSafeEqual** — baseline.
 *   3. **computeHmacSha256 exported** — returns lowercase hex digest
 *      via `.digest('hex')`.
 *   4. **verifyHmacSha256 exported with full signature** — `rawBody,
 *      signature, secret, tsSeconds, maxSkewMs=300_000` (5-min window
 *      default).
 *   5. **Timestamp window check happens BEFORE crypto** — cheap check
 *      first (DoS prevention).
 *   6. **sha256= prefix guard** — return false if signature doesn't
 *      start with `sha256=`.
 *   7. **Buffer-length parity check BEFORE timingSafeEqual** — Node
 *      throws if lengths differ; early-return false.
 *   8. **timingSafeEqual used for comparison** — NOT `===` or
 *      `Buffer.compare` (timing-attack prevention).
 *
 * Novel invariants locked (family #35):
 *   - **Timing-safe comparison** — timingSafeEqual is Node's built-in
 *     constant-time compare. Using `===` on buffers exposes per-byte
 *     timing signal.
 *   - **5-min default window** — 300_000 ms default; operator can
 *     tighten but cannot silently widen without seeing the default in
 *     code review.
 *   - **Cheap-check-first ordering** — timestamp check before HMAC
 *     compute prevents DoS via forged-but-malformed signatures.
 *
 * Drift scenarios covered:
 *   - Developer swaps `timingSafeEqual(a,b)` for `a.equals(b)` → case
 *     8 fails.
 *   - Default window bumped to 3_600_000 (1h) "for clock drift" → case
 *     4 fails.
 *   - sha256= prefix check removed → case 6 fails.
 *   - Buffer-length guard dropped → case 7 fails (Node crashes on
 *     short signature in prod).
 *
 * Symmetric to prior integrity edges:
 *   #193 PENTACONTAGON — signal-ingest endpoint's USE of this verifier.
 *   This edge locks the primitive's IMPLEMENTATION shape.
 *
 * Opens the **51st integrity edge — HENIPENTACONTAGON** (51-gon).
 * Second security-critical edge (after #193 PENTACONTAGON). Novel
 * family #35. Integrity pentacontagon → henipentacontagon (51-gon).
 *
 * Non-goals: asserting specific HMAC algorithm other than SHA-256
 * (YAGNI — no other algo in use); runtime integration test (covered
 * elsewhere).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const VERIFIER_FILE = resolve(REPO_ROOT, 'src/utils/hmac-verifier.ts');

const EXPECTED_DEFAULT_WINDOW_MS = 300_000;

function readVerifier(): string {
  return readFileSync(VERIFIER_FILE, 'utf8');
}

describe('HMAC verifier implementation discipline — 51st edge (HENIPENTACONTAGON)', () => {
  const src = readVerifier();

  it('hmac-verifier.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(400);
  });

  it('crypto imports: createHmac + timingSafeEqual from node:crypto', () => {
    expect(
      /import\s+\{\s*createHmac\s*,\s*timingSafeEqual\s*\}\s+from\s+['"]crypto['"]/.test(src),
      'crypto destructured import of createHmac + timingSafeEqual missing',
    ).toBe(true);
  });

  it('computeHmacSha256 exported + uses createHmac("sha256") + .digest("hex")', () => {
    expect(
      /export\s+function\s+computeHmacSha256\s*\(/.test(src),
      'computeHmacSha256 not exported as function',
    ).toBe(true);
    expect(
      /createHmac\(\s*['"]sha256['"]/.test(src),
      'createHmac must use "sha256" algorithm',
    ).toBe(true);
    expect(
      /\.digest\(\s*['"]hex['"]\s*\)/.test(src),
      '.digest("hex") must be used — lowercase hex contract',
    ).toBe(true);
  });

  it('verifyHmacSha256 exported with 5-parameter signature (default 5-min window)', () => {
    expect(
      /export\s+function\s+verifyHmacSha256\s*\(/.test(src),
      'verifyHmacSha256 not exported',
    ).toBe(true);
    expect(
      /maxSkewMs\s*:\s*number\s*=\s*300_?000/.test(src),
      `maxSkewMs default must equal ${EXPECTED_DEFAULT_WINDOW_MS}ms (5 min) — widening without review = replay-attack window increase`,
    ).toBe(true);
    // All 4 required params present
    for (const p of ['rawBody', 'signature', 'secret', 'tsSeconds']) {
      const re = new RegExp(`${p}\\s*:\\s*\\w+`);
      expect(re.test(src), `verifyHmacSha256 param ${p} missing`).toBe(true);
    }
  });

  it('timestamp window check BEFORE crypto compute (DoS-prevention ordering)', () => {
    // Scope to the callsite (`computeHmacSha256(secret, rawBody)`), not the function definition.
    const tsCheckIdx = src.search(/tsDeltaMs\s*>\s*maxSkewMs/);
    const computeCallIdx = src.search(/computeHmacSha256\(\s*secret\s*,\s*rawBody\s*\)/);
    expect(tsCheckIdx, 'tsDeltaMs > maxSkewMs guard missing').toBeGreaterThan(-1);
    expect(computeCallIdx, 'computeHmacSha256(secret, rawBody) callsite missing').toBeGreaterThan(-1);
    expect(
      tsCheckIdx < computeCallIdx,
      'timestamp window check must happen BEFORE computeHmacSha256 call — otherwise DoS via forged-timestamp requests triggers expensive HMAC',
    ).toBe(true);
  });

  it('sha256= prefix guard: return false if signature does not start with "sha256="', () => {
    expect(
      /signature\.startsWith\(\s*['"]sha256=['"]\s*\)/.test(src),
      'signature.startsWith("sha256=") guard missing — bare hex would be accepted (downgrade surface)',
    ).toBe(true);
    expect(
      /signature\.slice\(\s*7\s*\)/.test(src),
      'signature.slice(7) missing — prefix strip broken; hex compare would fail always',
    ).toBe(true);
  });

  it('buffer-length parity check BEFORE timingSafeEqual (crash prevention)', () => {
    const lenCheckIdx = src.search(/a\.length\s*!==\s*b\.length/);
    const tseIdx = src.search(/timingSafeEqual\(/);
    expect(
      lenCheckIdx,
      'buffer length !== guard missing — timingSafeEqual throws on length mismatch',
    ).toBeGreaterThan(-1);
    expect(tseIdx, 'timingSafeEqual call missing').toBeGreaterThan(-1);
    expect(
      lenCheckIdx < tseIdx,
      'length check must precede timingSafeEqual — otherwise Node crashes on short signature',
    ).toBe(true);
  });

  it('timingSafeEqual used for signature comparison (timing-attack prevention)', () => {
    expect(
      /return\s+timingSafeEqual\(\s*a\s*,\s*b\s*\)/.test(src),
      'timingSafeEqual(a, b) not used for final compare — timing-attack surface',
    ).toBe(true);
    // Defensive: ensure no === comparison on the hmac buffers
    expect(
      /provided\s*===\s*expected/.test(src),
      'string === comparison found — timing-attack surface; MUST use timingSafeEqual on buffers',
    ).toBe(false);
  });

  it('try/catch wraps Buffer.from + timingSafeEqual (graceful invalid-hex handling)', () => {
    expect(
      /try\s*\{[\s\S]*Buffer\.from\(/.test(src),
      'try/catch wrapping missing — invalid-hex input would throw and crash handler',
    ).toBe(true);
    expect(
      /catch\s*[\s\S]*return\s+false/.test(src),
      'catch block does not return false — graceful-fail contract broken',
    ).toBe(true);
  });

  it('composite: 8 axes hold simultaneously (HMAC primitive coherence)', () => {
    expect(/import\s+\{\s*createHmac\s*,\s*timingSafeEqual\s*\}/.test(src)).toBe(true);
    expect(/createHmac\(\s*['"]sha256['"]/.test(src)).toBe(true);
    expect(/\.digest\(\s*['"]hex['"]/.test(src)).toBe(true);
    expect(/maxSkewMs\s*:\s*number\s*=\s*300_?000/.test(src)).toBe(true);
    expect(
      src.search(/tsDeltaMs\s*>\s*maxSkewMs/) < src.search(/computeHmacSha256\(\s*secret\s*,\s*rawBody\s*\)/),
    ).toBe(true);
    expect(/signature\.startsWith\(\s*['"]sha256=['"]/.test(src)).toBe(true);
    expect(/a\.length\s*!==\s*b\.length/.test(src)).toBe(true);
    expect(/return\s+timingSafeEqual\(/.test(src)).toBe(true);
    expect(/provided\s*===\s*expected/.test(src)).toBe(false);
  });
});
