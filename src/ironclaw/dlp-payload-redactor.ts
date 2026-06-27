/**
 * DLP Payload Redactor
 * Replaces matched sensitive substrings with [REDACTED:pattern-id].
 * Works on string bodies; binary bodies are passed through unchanged.
 */

import type { DlpPattern } from './dlp-pattern-registry';

export interface RedactResult {
  body: string;
  redacted: boolean;
  patternIds: string[];
}

/**
 * Replace all occurrences of pattern in text with redaction marker.
 */
function replacePattern(text: string, p: DlpPattern): { text: string; hit: boolean } {
  const marker = `[REDACTED:${p.id}]`;

  if (p.matchType === 'regex') {
    let re: RegExp;
    try {
      re = new RegExp(p.pattern, 'g');
    } catch {
      return { text, hit: false };
    }
    const next = text.replace(re, marker);
    return { text: next, hit: next !== text };
  }

  // substring — replace all occurrences
  if (!text.includes(p.pattern)) return { text, hit: false };
  const escaped = p.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const next = text.replace(new RegExp(escaped, 'g'), marker);
  return { text: next, hit: true };
}

/**
 * Apply a list of redact-action patterns to a body string.
 * Only patterns with action 'redact' are applied.
 */
export function redactBody(body: string, patterns: DlpPattern[]): RedactResult {
  let current = body;
  const patternIds: string[] = [];

  for (const p of patterns) {
    if (p.action !== 'redact') continue;
    const { text, hit } = replacePattern(current, p);
    if (hit) {
      current = text;
      patternIds.push(p.id);
    }
  }

  return {
    body: current,
    redacted: patternIds.length > 0,
    patternIds,
  };
}

/**
 * Redact header values for patterns scoped to 'header' or 'any'.
 */
export function redactHeaders(
  headers: Record<string, string>,
  patterns: DlpPattern[]
): { headers: Record<string, string>; redacted: boolean; patternIds: string[] } {
  const out: Record<string, string> = { ...headers };
  const patternIds: string[] = [];

  for (const p of patterns) {
    if (p.action !== 'redact') continue;
    if (p.scope !== 'header' && p.scope !== 'any') continue;
    for (const key of Object.keys(out)) {
      const { text, hit } = replacePattern(out[key], p);
      if (hit) {
        out[key] = text;
        if (!patternIds.includes(p.id)) patternIds.push(p.id);
      }
    }
  }

  return { headers: out, redacted: patternIds.length > 0, patternIds };
}
