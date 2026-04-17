/**
 * Strategy Review Trigger Reason Enum Sync.
 *
 * `docs/strategy-review-reasons.md` declares the canonical enum of
 * `trigger_reason` values. The only code site that emits these values is
 * `src/wiring/qwen-signals-loop.ts` via `insertReviewTask(source, '<reason>', metrics)`
 * call sites. If the two drift, the doc becomes stale guidance and operators
 * chasing a `reason=` label in a Grafana panel hit a dead reference.
 *
 * Symmetric to PR #132 (alert↔metric), PR #135 (dashboard↔metric),
 * PR #137 (runbook-index↔file), PR #143 (alert↔runbook). Closes the
 * doc-enum integrity gap called out inline in strategy-review-reasons.md.
 *
 * Non-goals: validating label values on Prometheus counter emission, Grafana
 * panel reason filters, or DB column check constraints.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DOC_PATH = resolve(__dirname, '../../docs/strategy-review-reasons.md');
const CODE_PATH = resolve(__dirname, '../../src/wiring/qwen-signals-loop.ts');

/**
 * Strip `//` line comments and `/* ... *\/` block comments so that commented-out
 * `insertReviewTask` calls are not treated as live enum emissions. Naive but
 * sufficient for this repo: no string literals contain `//` or `/*` sequences.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract active reasons from the doc's "Active reasons" markdown table.
 * Row shape: `| \`reason_name\` | ... | ... | ... | ... |`. We only care about
 * the first column's backticked identifier. "Deprecating a reason" section
 * keeps retired entries with strikethrough — those are intentionally NOT
 * parsed here (strikethrough rows use `~~reason~~` not backticks). Capture is
 * deliberately permissive (`[\w-]+`) so casing-drift is caught by the style
 * assertion below instead of being silently skipped.
 */
function extractDocReasons(md: string): Set<string> {
  const reasons = new Set<string>();
  const activeSection = md.split('## Active reasons')[1]?.split('## ')[0] ?? '';
  const rowRegex = /^\|\s*`([\w-]+)`\s*\|/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(activeSection)) !== null) {
    reasons.add(m[1]);
  }
  return reasons;
}

/**
 * Extract reasons passed to `insertReviewTask(source, '<reason>', metrics)`.
 * The signature fixes the reason to the 2nd positional arg as a string literal.
 * If the call site ever becomes dynamic (variable), this parser returns empty
 * and the sanity floor below fails loudly rather than silently passing. Capture
 * is permissive (`[\w-]+`) so casing drift surfaces in the style assertion.
 */
function extractCodeReasons(src: string): Set<string> {
  const reasons = new Set<string>();
  const callRegex = /insertReviewTask\s*\(\s*[a-zA-Z_][\w.]*\s*,\s*['"]([\w-]+)['"]\s*,/g;
  const uncommented = stripComments(src);
  let m: RegExpExecArray | null;
  while ((m = callRegex.exec(uncommented)) !== null) {
    reasons.add(m[1]);
  }
  return reasons;
}

const STYLE_RE = /^[a-z][a-z0-9_]*$/;

describe('strategy-review trigger-reason enum — doc↔code sync', () => {
  const docContent = readFileSync(DOC_PATH, 'utf8');
  const codeContent = readFileSync(CODE_PATH, 'utf8');
  const docReasons = extractDocReasons(docContent);
  const codeReasons = extractCodeReasons(codeContent);

  it('doc parser extracts at least 2 active reasons (sanity floor)', () => {
    expect(
      docReasons.size,
      'doc "Active reasons" table parsed 0 reasons — table shape likely changed'
    ).toBeGreaterThanOrEqual(2);
  });

  it('code parser extracts at least 2 insertReviewTask call sites (sanity floor)', () => {
    expect(
      codeReasons.size,
      'qwen-signals-loop.ts yielded 0 insertReviewTask calls — call site may have gone dynamic'
    ).toBeGreaterThanOrEqual(2);
  });

  it('all reasons follow snake_case convention (no UPPER, kebab, or mixed)', () => {
    const offenders = [...docReasons, ...codeReasons].filter((r) => !STYLE_RE.test(r));
    expect(
      offenders,
      `${offenders.length} reason(s) violate snake_case: ${offenders.join(', ')} — Prom label + DB column values must be lowercase_with_underscores`
    ).toEqual([]);
  });

  it('every code-emitted reason is documented (no undocumented enum values)', () => {
    const undocumented = [...codeReasons].filter((r) => !docReasons.has(r));
    expect(
      undocumented,
      `code emits ${undocumented.length} reason(s) missing from docs/strategy-review-reasons.md: ${undocumented.join(', ')}`
    ).toEqual([]);
  });

  it('every documented active reason is actually emitted by code (no stale doc entries)', () => {
    const stale = [...docReasons].filter((r) => !codeReasons.has(r));
    expect(
      stale,
      `docs/strategy-review-reasons.md lists ${stale.length} active reason(s) not emitted by qwen-signals-loop.ts: ${stale.join(', ')} — move to deprecated section or drop`
    ).toEqual([]);
  });
});
