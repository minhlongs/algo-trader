/**
 * DLP Pattern Matcher
 * Stateless match engine: regex + substring against URL / headers / body.
 * Returns first matching pattern (highest-priority = earliest in list).
 */

import type { DlpPattern, DlpScope } from '../../desk/ironclaw/dlp-pattern-registry';

export interface MatchTarget {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export type MatchResult =
  | { matched: true; pattern: DlpPattern; in: DlpScope }
  | { matched: false };

/** Test a single text value against a pattern definition. */
function testText(text: string, p: DlpPattern): boolean {
  if (p.matchType === 'regex') {
    try {
      return new RegExp(p.pattern).test(text);
    } catch {
      return false;
    }
  }
  // substring
  return text.includes(p.pattern);
}

/** Resolve which targets to check for a given scope. */
function resolveTargets(
  scope: DlpScope,
  t: MatchTarget
): Array<{ text: string; in: DlpScope }> {
  if (scope === 'url')    return [{ text: t.url, in: 'url' }];
  if (scope === 'body')   return [{ text: t.body, in: 'body' }];
  if (scope === 'header') return Object.values(t.headers).map(v => ({ text: v, in: 'header' as DlpScope }));
  // 'any' — check all
  return [
    { text: t.url, in: 'url' as DlpScope },
    { text: t.body, in: 'body' as DlpScope },
    ...Object.values(t.headers).map(v => ({ text: v, in: 'header' as DlpScope })),
  ];
}

/**
 * Find the first pattern that matches the outbound call target.
 * Patterns are evaluated in list order; first match wins.
 */
export function matchPatterns(
  patterns: DlpPattern[],
  target: MatchTarget
): MatchResult {
  for (const p of patterns) {
    const candidates = resolveTargets(p.scope, target);
    for (const c of candidates) {
      if (testText(c.text, p)) {
        return { matched: true, pattern: p, in: c.in };
      }
    }
  }
  return { matched: false };
}

/**
 * Collect ALL matches (for audit / alert use-cases).
 */
export function allMatches(
  patterns: DlpPattern[],
  target: MatchTarget
): Array<{ pattern: DlpPattern; in: DlpScope }> {
  const results: Array<{ pattern: DlpPattern; in: DlpScope }> = [];
  for (const p of patterns) {
    const candidates = resolveTargets(p.scope, target);
    for (const c of candidates) {
      if (testText(c.text, p)) {
        results.push({ pattern: p, in: c.in });
        break; // one match per pattern is enough
      }
    }
  }
  return results;
}
