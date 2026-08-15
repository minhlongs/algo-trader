/**
 * Qwen Signals Loop decision enum sync.
 *
 * The `decision` enum on `qwen_signals_loop_runs.decision` is declared in THREE
 * places that must stay in lockstep:
 *   1. DB CHECK constraint in `src/db/migrations/018_qwen_signals_loop_runs.sql`
 *   2. Mirror of that CHECK in `docs/system-architecture.md`
 *   3. TypeScript union type + call-site literals in `src/wiring/qwen-signals-loop.ts`
 *
 * Operators filtering `/api/v1/admin/qwen/signals-loop/runs?decision=...`,
 * Grafana panels filtering the `algo_trader_qwen_signals_loop_runs_total{decision}`
 * counter, and runbooks referencing `decision='error'` all rely on these three
 * sources agreeing. A drift (e.g. a developer adds `decision='retention_drift'`
 * to the union type without updating the DB migration or the doc) would silently
 * break either the INSERT (CHECK violation) or the operator experience (filter
 * string with no matching records).
 *
 * Symmetric to PR #132 (alert↔metric), PR #135 (dashboard↔metric),
 * PR #137 (runbook-index↔file), PR #143 (alert↔runbook URL),
 * PR #145 (doc-enum↔code-enum for trigger_reason),
 * PR #146 (runbook↔code-metric), PR #148 (CLI↔route),
 * PR #150 (CLI self-consistency), PR #152 (CLAUDE phase guide↔CI gate).
 * Opens the 10th integrity edge — closes the last Pillar 3 gap so the
 * Signals Loop decision surface is fully covered by integration tests.
 * Integrity nonagon → decagon.
 *
 * Non-goals: validating decision *semantics* (that a given branch actually fires
 * the journal), admin API response shape (covered by its own route tests), or
 * exhaustive control-flow coverage (covered by qwen-signals-loop.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/018_qwen_signals_loop_runs.sql');
const DOC_PATH = resolve(REPO_ROOT, 'docs/system-architecture.md');
const CODE_PATH = resolve(REPO_ROOT, 'src/desk/wiring/qwen-signals-loop.ts');
const METRICS_PATH = resolve(REPO_ROOT, 'src/platform/middleware/prometheus-registry.ts');

/**
 * Strip JS/TS comments so commented-out literals / union members are not
 * counted as live enum declarations. Safe here because no string literals in
 * the scanned files contain `//` or block-comment sequences.
 */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Strip SQL line comments (`-- ...`) so commented-out enum literals don't
 * count. Block comments (`/* ... *\/`) also stripped — migrations rarely use
 * them but belt-and-braces.
 */
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/**
 * Extract the `decision IN ('a', 'b', ...)` literal list from either the
 * migration SQL or the same CHECK snippet mirrored in docs. Returns empty set
 * if the CHECK shape drifted — caller's sanity floor assertion will fail.
 */
function extractCheckEnum(sql: string): Set<string> {
  const out = new Set<string>();
  const m = /decision\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*decision\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(sql);
  if (!m) return out;
  const literals = m[1].matchAll(/'([^']+)'/g);
  for (const lit of literals) out.add(lit[1]);
  return out;
}

/**
 * Extract the union type members from `decision: 'a' | 'b' | 'c'` in the
 * `persistRunJournal` signature. That signature is the single authoritative
 * TS declaration of the enum — all emission sites pass values typed against it.
 */
function extractUnionType(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  const m = /decision\s*:\s*((?:'[^']+'\s*\|\s*)+'[^']+')/.exec(clean);
  if (!m) return out;
  for (const lit of m[1].matchAll(/'([^']+)'/g)) out.add(lit[1]);
  return out;
}

/**
 * Extract every string literal passed as the 3rd positional arg to
 * `persistRunJournal(source, metrics, 'LITERAL', ...)`. Dynamic/variable 3rd
 * args are ignored — they are covered by the union type extractor via the
 * function signature. Ternaries like `triggerReasons.length > 0 ? 'queued_review' : 'ok'`
 * contribute both literals.
 */
function extractCallSiteLiterals(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  // Match inside a persistRunJournal(...) call body and collect all 'string' literals.
  // Using a non-greedy capture to grab everything up to the matching close paren on
  // the same top-level call — sufficient here because persistRunJournal calls don't
  // nest function calls that also emit decision literals.
  const callRe = /persistRunJournal\s*\(([\s\S]*?)\)\s*;/g;
  let call: RegExpExecArray | null;
  while ((call = callRe.exec(clean)) !== null) {
    for (const lit of call[1].matchAll(/'([^']+)'/g)) {
      // Only accept snake_case-looking tokens to filter out incidental strings
      // (e.g. error messages). Enum discipline is asserted separately below.
      if (/^[a-z][a-z0-9_]*$/.test(lit[1])) out.add(lit[1]);
    }
  }
  return out;
}

const STYLE_RE = /^[a-z][a-z0-9_]*$/;

describe('qwen_signals_loop_runs.decision enum — 3-way sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const doc = readFileSync(DOC_PATH, 'utf8');
  const code = readFileSync(CODE_PATH, 'utf8');
  const metrics = readFileSync(METRICS_PATH, 'utf8');

  const migrationEnum = extractCheckEnum(stripSqlComments(migration));
  const docEnum = extractCheckEnum(doc);
  const unionEnum = extractUnionType(code);
  const callSiteEnum = extractCallSiteLiterals(code);

  it('migration parser extracts at least 3 decisions (sanity floor)', () => {
    expect(
      migrationEnum.size,
      'migration 018 CHECK constraint parsed 0 values — shape likely changed'
    ).toBeGreaterThanOrEqual(3);
  });

  it('doc parser extracts at least 3 decisions (sanity floor)', () => {
    expect(
      docEnum.size,
      'system-architecture.md CHECK mirror parsed 0 values — doc snippet drifted'
    ).toBeGreaterThanOrEqual(3);
  });

  it('TS union-type parser extracts at least 3 decisions (sanity floor)', () => {
    expect(
      unionEnum.size,
      'persistRunJournal decision union parsed 0 members — signature drifted'
    ).toBeGreaterThanOrEqual(3);
  });

  it('persistRunJournal call-site literals extract at least 3 decisions (sanity floor)', () => {
    expect(
      callSiteEnum.size,
      'no persistRunJournal literal 3rd args found — every branch should emit a snake_case decision literal'
    ).toBeGreaterThanOrEqual(3);
  });

  it('all collected decisions follow snake_case (Prom label + DB CHECK discipline)', () => {
    const all = new Set([...migrationEnum, ...docEnum, ...unionEnum, ...callSiteEnum]);
    const offenders = [...all].filter((d) => !STYLE_RE.test(d));
    expect(
      offenders,
      `${offenders.length} decision value(s) violate snake_case: ${offenders.join(', ')}`
    ).toEqual([]);
  });

  it('migration ↔ doc bijection (docs mirror matches DB CHECK)', () => {
    const missingFromDoc = [...migrationEnum].filter((d) => !docEnum.has(d));
    const staleInDoc = [...docEnum].filter((d) => !migrationEnum.has(d));
    expect(
      { missingFromDoc, staleInDoc },
      `doc↔migration drift — missingFromDoc=${missingFromDoc.join(',')} staleInDoc=${staleInDoc.join(',')}`
    ).toEqual({ missingFromDoc: [], staleInDoc: [] });
  });

  it('migration ↔ TS union bijection (code union matches DB CHECK)', () => {
    const missingFromUnion = [...migrationEnum].filter((d) => !unionEnum.has(d));
    const staleInUnion = [...unionEnum].filter((d) => !migrationEnum.has(d));
    expect(
      { missingFromUnion, staleInUnion },
      `union↔migration drift — missingFromUnion=${missingFromUnion.join(',')} staleInUnion=${staleInUnion.join(',')}`
    ).toEqual({ missingFromUnion: [], staleInUnion: [] });
  });

  it('every migration decision is emitted by at least one persistRunJournal call site', () => {
    const neverEmitted = [...migrationEnum].filter((d) => !callSiteEnum.has(d));
    expect(
      neverEmitted,
      `migration declares ${neverEmitted.length} decision(s) never emitted in code: ${neverEmitted.join(', ')} — dead enum value`
    ).toEqual([]);
  });

  it('prometheus counter qwenSignalsLoopRunsTotal declares "decision" as a label', () => {
    const block = /export const qwenSignalsLoopRunsTotal\s*=\s*new client\.Counter\(\{[\s\S]*?\}\);/.exec(metrics);
    expect(block, 'qwenSignalsLoopRunsTotal counter export not found').not.toBeNull();
    const labelLine = /labelNames:\s*\[([^\]]*)\]/.exec(block![0]);
    expect(labelLine, 'labelNames array not declared on qwenSignalsLoopRunsTotal').not.toBeNull();
    const labels = [...labelLine![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(
      labels,
      `expected 'decision' in labelNames, got [${labels.join(', ')}]`
    ).toContain('decision');
  });
});
