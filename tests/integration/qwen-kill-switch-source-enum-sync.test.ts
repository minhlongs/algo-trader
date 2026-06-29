/**
 * Qwen Kill-Switch `source` label enum 3-surface sync.
 *
 * The `source` label on the `qwenKillSwitchActive` Prometheus gauge tags WHERE
 * the L1 kill decision originated — `env` for the boot-time `QWEN_KILL` env
 * var (L1 tier, always-on hardcoded guard) vs `kv` for the live admin-API /
 * CF-KV toggle (operator-controlled). Both can be simultaneously set, so the
 * gauge is labeled to distinguish the two provenances in Grafana.
 *
 * The enum is declared across three surfaces that must stay in lockstep:
 *
 *   1. **Metric help text** — `qwenKillSwitchActive` Gauge help string in
 *      `src/platform/middleware/prometheus-metrics.ts` ends with the phrase
 *      `Labels: source=env|kv` — the operator-facing contract.
 *   2. **Helper function TS union** — `setQwenKillSwitch(source: 'env' | 'kv',
 *      active: boolean)` in the same file — the compile-time contract.
 *   3. **Production emit sites** — only `src/wiring/qwen-drawdown-monitor.ts`
 *      currently calls `setQwenKillSwitch('env', …)`; the `'kv'` source is
 *      declared + tested but not yet wired in prod (reserved slot pending the
 *      admin-API KV toggle).
 *
 * Drift scenarios (all silently destructive):
 *   - Adding `source: 'cli'` in the TS union without extending `env|kv` help
 *     text → operators grepping `algo_trader_qwen_kill_switch_active` help
 *     line don't see the new provenance; runbook alert definition lags.
 *   - Help text declares `env|kv|cli` but no code path emits `cli` and no test
 *     asserts it → phantom label documented; Grafana filter dropdown leaks a
 *     never-populated option.
 *   - Production code starts emitting `setQwenKillSwitch('kv', …)` without
 *     updating the reservation allowlist → reserved-slot invariant broken,
 *     signalling that the admin-API toggle wiring is live but the test
 *     harness hasn't been flipped to reflect active use.
 *
 * Reserved-slot semantics:
 *   `RESERVED_SOURCES = {'kv'}` — declared in help text + TS union + exercised
 *   by `src/wiring/__tests__/qwen-observability.test.ts:14-15` (which emits
 *   BOTH `env` and `kv` to prove both labels propagate), but NOT yet emitted
 *   from production `src/` code. This is structurally parallel to PR #154's
 *   `RESERVED_STATUSES = {'acknowledged'}` (declared in migration CHECK but
 *   not yet wired in handler code), not PR #155's empty `RESERVED_ACTIONS`
 *   (ready-to-receive harness with no current reservation).
 *
 * When the admin-API KV toggle ships:
 *   1. Add `setQwenKillSwitch('kv', …)` call in the new handler (e.g.
 *      `admin-qwen-routes.ts`).
 *   2. Move `'kv'` from `RESERVED_SOURCES` to `ACTIVE_SOURCES` in this test.
 *   3. This test keeps the entire triangle in lockstep.
 *
 * Symmetric to the prior integrity edges:
 *   #132 alert↔metric, #135 dashboard↔metric, #137 runbook-index↔file,
 *   #143 alert↔runbook URL, #145 doc-enum↔code-enum trigger_reason,
 *   #146 runbook↔code-metric, #148 CLI↔route, #150 CLI self-consistency,
 *   #152 CLAUDE phase guide↔CI gate, #153 decision enum 3-way sync,
 *   #154 status enum 4-surface sync, #155 kill-action enum 3-surface sync.
 * Opens the **13th integrity edge** — extends Pillar 2 observability integrity
 * onto the second label dimension (after PR #155 closed the first). Pillar 3
 * L1 kill-switch provenance audit trail locked.
 * Integrity dodecagon → tridecagon (13-gon).
 *
 * Non-goals: validating gauge numeric values (covered by
 * qwen-observability.test.ts), exercising the CF-KV path (deferred), or
 * asserting that `'kv'` is eventually wired (both "implement" and "delete
 * the reservation" are valid evolutions).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const METRICS_PATH = resolve(REPO_ROOT, 'src/platform/middleware/prometheus-metrics.ts');
const DRAWDOWN_MONITOR_PATH = resolve(
  REPO_ROOT,
  'src/wiring/qwen-drawdown-monitor.ts',
);
const OBSERVABILITY_TEST_PATH = resolve(
  REPO_ROOT,
  'src/wiring/__tests__/qwen-observability.test.ts',
);

/** Sources declared in help text + TS union but intentionally not yet emitted by prod code. */
const RESERVED_SOURCES = new Set<string>(['kv']);

/** Sources actively emitted by production wiring code (src/ excluding tests). */
const ACTIVE_SOURCES = new Set<string>(['env']);

const STYLE_RE = /^[a-z][a-z0-9_]*$/;

/** Strip JS/TS comments so commented-out literals/examples are ignored. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the help-text string of the `qwenKillSwitchActive` gauge
 * declaration, then parse the `source=a|b|…` trailing phrase.
 *
 * Rationale: the help text is the operator-facing contract; help: 'L1 kill-
 * switch active state (0|1). Labels: source=env|kv' — the parser locks the
 * `|`-delimited vocabulary to the function signature + call sites.
 */
function extractHelpTextSources(src: string): Set<string> {
  const out = new Set<string>();
  const blockRe =
    /export\s+const\s+qwenKillSwitchActive[\s\S]*?help:\s*'([^']+)'/;
  const m = blockRe.exec(src);
  if (!m) return out;
  const help = m[1];
  // Capture source=a|b|... — trailing vocabulary after `source=`.
  const sourceRe = /source=([a-z][a-z0-9_|]*)\b/;
  const p = sourceRe.exec(help);
  if (!p) return out;
  for (const token of p[1].split('|')) {
    if (token) out.add(token);
  }
  return out;
}

/**
 * Extract the TS union members of the `setQwenKillSwitch` helper's `source`
 * parameter — e.g. `source: 'env' | 'kv'` → {'env', 'kv'}.
 *
 * The union is the compile-time contract: any drift between this and the
 * help text means a phantom label was added in types without doc update, or
 * vice-versa.
 */
function extractTsUnionSources(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  // Match: setQwenKillSwitch(source: 'a' | 'b' | ..., active: ...)
  const sigRe =
    /function\s+setQwenKillSwitch\s*\(\s*source:\s*([^,)]+),/;
  const m = sigRe.exec(clean);
  if (!m) return out;
  const unionText = m[1];
  const literalRe = /'([a-z_][a-z0-9_]*)'/g;
  for (const lit of unionText.matchAll(literalRe)) out.add(lit[1]);
  return out;
}

/**
 * Extract every `setQwenKillSwitch('…', …)` literal from a given source file.
 *
 * Used for: (a) production code scan (wiring/*.ts excluding tests),
 * (b) test-file scan (for sanity that declared sources are exercised).
 */
function extractCallSiteSources(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  const callRe = /setQwenKillSwitch\s*\(\s*'([a-z_][a-z0-9_]*)'/g;
  for (const m of clean.matchAll(callRe)) out.add(m[1]);
  return out;
}

describe('Qwen kill-switch source label enum 3-surface sync', () => {
  const metricsSrc = readFileSync(METRICS_PATH, 'utf8');
  const drawdownMonitorSrc = readFileSync(DRAWDOWN_MONITOR_PATH, 'utf8');
  const observabilityTestSrc = readFileSync(OBSERVABILITY_TEST_PATH, 'utf8');

  const helpSources = extractHelpTextSources(metricsSrc);
  const unionSources = extractTsUnionSources(metricsSrc);
  const prodSources = extractCallSiteSources(drawdownMonitorSrc);
  const testSources = extractCallSiteSources(observabilityTestSrc);

  it('sanity: metric help text declares at least 2 sources (env + kv)', () => {
    expect(helpSources.size).toBeGreaterThanOrEqual(2);
    expect(helpSources.has('env')).toBe(true);
    expect(helpSources.has('kv')).toBe(true);
  });

  it('sanity: setQwenKillSwitch TS union declares at least 2 sources', () => {
    expect(unionSources.size).toBeGreaterThanOrEqual(2);
  });

  it('sanity: production wiring emits at least 1 source', () => {
    expect(prodSources.size).toBeGreaterThanOrEqual(1);
  });

  it('sanity: observability test exercises all declared sources', () => {
    // The test file is the harness that proves every declared label actually
    // propagates; missing coverage here = declared-but-untested drift.
    for (const s of helpSources) {
      expect(
        testSources.has(s),
        `declared source '${s}' is not exercised by qwen-observability.test.ts`,
      ).toBe(true);
    }
  });

  it('gauge declares labelNames: [\'source\'] (not a deprecated label set)', () => {
    const block = /export\s+const\s+qwenKillSwitchActive[\s\S]*?\}\);/.exec(
      metricsSrc,
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/labelNames:\s*\[\s*'source'\s*\]/);
  });

  it('every source (help, union, prod, test) is snake_case lower-kebab', () => {
    const all = new Set<string>([
      ...helpSources,
      ...unionSources,
      ...prodSources,
      ...testSources,
    ]);
    for (const s of all) {
      expect(s, `source '${s}' violates style ${STYLE_RE}`).toMatch(STYLE_RE);
    }
  });

  it('help text and TS union are bijective (no declaration drift)', () => {
    const helpOnly = [...helpSources].filter((s) => !unionSources.has(s));
    const unionOnly = [...unionSources].filter((s) => !helpSources.has(s));
    expect(
      helpOnly,
      `sources in help text but not TS union: ${helpOnly.join(', ')}`,
    ).toHaveLength(0);
    expect(
      unionOnly,
      `sources in TS union but not help text: ${unionOnly.join(', ')}`,
    ).toHaveLength(0);
  });

  it('every prod-emitted source is declared in both help text and TS union', () => {
    const missingHelp = [...prodSources].filter((s) => !helpSources.has(s));
    const missingUnion = [...prodSources].filter((s) => !unionSources.has(s));
    expect(
      missingHelp,
      `prod emits sources absent from help text: ${missingHelp.join(', ')}`,
    ).toHaveLength(0);
    expect(
      missingUnion,
      `prod emits sources absent from TS union: ${missingUnion.join(', ')}`,
    ).toHaveLength(0);
  });

  it('ACTIVE_SOURCES canonical set matches prod emissions today', () => {
    // Drift detector: if prod starts emitting 'kv' (or a new source), this
    // fails — dev must update ACTIVE_SOURCES + RESERVED_SOURCES.
    expect(
      [...prodSources].sort(),
      `ACTIVE_SOURCES mismatch — prod emits {${[...prodSources].join(
        ', ',
      )}}, canonical = {${[...ACTIVE_SOURCES].join(', ')}}`,
    ).toEqual([...ACTIVE_SOURCES].sort());
  });

  it('RESERVED_SOURCES are declared but NOT emitted by prod (reservation semantics)', () => {
    // Every reserved source must appear in help + union (so it's a declared
    // slot), but must NOT appear in prod emissions (otherwise the
    // reservation semantics are broken — dev forgot to graduate it).
    for (const r of RESERVED_SOURCES) {
      expect(
        helpSources.has(r),
        `reserved source '${r}' is missing from help text declaration`,
      ).toBe(true);
      expect(
        unionSources.has(r),
        `reserved source '${r}' is missing from TS union declaration`,
      ).toBe(true);
      expect(
        prodSources.has(r),
        `reserved source '${r}' leaked into prod emissions — graduate it to ACTIVE_SOURCES or remove the call site`,
      ).toBe(false);
    }
  });

  it('help∪union partition is exactly ACTIVE_SOURCES ∪ RESERVED_SOURCES', () => {
    // The full declared vocabulary must be partitioned — every declared
    // source is EITHER actively emitted OR explicitly reserved. No orphans.
    const declared = new Set<string>([...helpSources, ...unionSources]);
    const expected = new Set<string>([...ACTIVE_SOURCES, ...RESERVED_SOURCES]);
    const orphan = [...declared].filter((s) => !expected.has(s));
    const unexpected = [...expected].filter((s) => !declared.has(s));
    expect(
      orphan,
      `declared source not in ACTIVE∪RESERVED: ${orphan.join(', ')}`,
    ).toHaveLength(0);
    expect(
      unexpected,
      `canonical source absent from declaration surfaces: ${unexpected.join(', ')}`,
    ).toHaveLength(0);
  });
});
