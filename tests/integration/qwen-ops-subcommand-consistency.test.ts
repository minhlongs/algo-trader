/**
 * qwen-ops.sh subcommand self-consistency checker.
 *
 * `scripts/qwen-ops.sh` documents its subcommands in THREE places:
 *   1. Top-of-file `# Commands: a | b | c | help` header comment (manifest)
 *   2. `usage()` heredoc shown by `./qwen-ops.sh` (no args) or `help`
 *   3. `case "$cmd" in …` dispatch — the source of truth at runtime
 *
 * When a new subcommand is added to (3) but (1) and (2) drift, two failure
 * modes hit the 3am operator:
 *   - Operator runs `./qwen-ops.sh` → sees stale `usage()` → never discovers
 *     the new capability → falls back to manual curl
 *   - New hire reads header `# Commands:` line → forms wrong mental model →
 *     misses subcommand entirely
 *
 * Conversely, an entry in (1) or (2) that is *not* dispatched by (3) is a
 * "ghost command" — operator types it, gets `unknown command`, loses trust
 * in the CLI as a 3am tool.
 *
 * This test asserts bijection across all three surfaces. Meta-aliases
 * (`help`, `-h`, `--help`) and the `*` fallback are excluded from the
 * comparison set since they are dispatcher-internal, not user-visible
 * operations.
 *
 * Complements PR #148 (CLI ↔ HTTP route sync — operator-CLI ↔ admin-routes
 * edge). This is the *intra-CLI* edge: the CLI's own self-description must
 * stay in sync with its own dispatch. Together they form the 8th edge of
 * the observability/operator-feedback integrity polygon (heptagon → octagon).
 *
 * Non-goals: subcommand argument validation, exit-code semantics, runtime
 * behaviour, ordering of help text.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CLI_PATH = resolve(__dirname, '../../scripts/qwen-ops.sh');

/**
 * Dispatcher-internal entries excluded from user-facing command set.
 * `help|-h|--help` print usage; `*` is the unknown-command fallback.
 */
const META_ENTRIES = new Set(['help', '-h', '--help', '*']);

/**
 * Parse `case` dispatch. Branch labels look like `  health)` or
 * `  help|-h|--help)` — leading 2-space indent (inside the `case` block),
 * one-or-more pipe-joined patterns, closing paren.
 */
const CASE_BRANCH_RE = /^\s{2}([a-zA-Z_|*\-]+)\)$/gm;

function extractCaseCommands(sh: string): Set<string> {
  const cmds = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = CASE_BRANCH_RE.exec(sh)) !== null) {
    for (const part of m[1].split('|')) {
      if (!META_ENTRIES.has(part)) cmds.add(part);
    }
  }
  return cmds;
}

/**
 * Parse `usage()` heredoc. Inside the heredoc, command rows look like:
 *   `  health              GET /health — …`
 *   `  resolve <id>        POST /api/…`
 * Pattern: 2-space indent, lowercase word (= command name), optional
 * `<arg>` placeholder, ≥2 spaces gap, then a description starting with
 * a capital letter (filters out env-var rows like `  QWEN_OPS_HOST` which
 * start uppercase, and example invocations starting with `ADMIN_API_KEY=`).
 */
const USAGE_ROW_RE = /^ {2}([a-z][a-z_-]*)(?:\s+<[^>]+>)?\s{2,}[A-Z]/gm;

function extractUsageCommands(sh: string): Set<string> {
  const cmds = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = USAGE_ROW_RE.exec(sh)) !== null) {
    cmds.add(m[1]);
  }
  return cmds;
}

/**
 * Parse `# Commands: a | b | c | help` header manifest. Single line,
 * pipe-separated, each token may be `name` or `name <arg>`.
 */
const HEADER_RE = /^#\s*Commands:\s*(.+?)\s*$/m;

function extractHeaderCommands(sh: string): Set<string> | null {
  const m = HEADER_RE.exec(sh);
  if (!m) return null;
  const cmds = new Set<string>();
  for (const tok of m[1].split('|')) {
    const name = tok.trim().split(/\s+/)[0];
    if (name && !META_ENTRIES.has(name)) cmds.add(name);
  }
  return cmds;
}

const cliSrc = readFileSync(CLI_PATH, 'utf8');
const caseCmds = extractCaseCommands(cliSrc);
const usageCmds = extractUsageCommands(cliSrc);
const headerCmds = extractHeaderCommands(cliSrc);

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

describe('qwen-ops.sh subcommand self-consistency', () => {
  it('parses at least 6 case branches (sanity floor)', () => {
    expect(
      caseCmds.size,
      `case dispatch yielded ${caseCmds.size} branches — parser may be stale or dispatcher refactored`
    ).toBeGreaterThanOrEqual(6);
  });

  it('parses at least 6 usage heredoc rows (sanity floor)', () => {
    expect(
      usageCmds.size,
      `usage() heredoc yielded ${usageCmds.size} rows — parser may be stale or help-text style changed`
    ).toBeGreaterThanOrEqual(6);
  });

  it('finds the `# Commands:` header manifest (non-null)', () => {
    expect(
      headerCmds,
      'top-of-file `# Commands:` header comment missing — operator quick-reference gone'
    ).not.toBeNull();
  });

  it('every case branch is documented in usage() heredoc', () => {
    const missing = diff(caseCmds, usageCmds);
    expect(
      missing,
      `${missing.length} case branch(es) missing from usage() — 3am operator never discovers them:\n  ${missing.join('\n  ')}`
    ).toEqual([]);
  });

  it('every usage() row maps to a case branch (no ghost commands)', () => {
    const missing = diff(usageCmds, caseCmds);
    expect(
      missing,
      `${missing.length} usage() row(s) have no case branch — operator gets "unknown command":\n  ${missing.join('\n  ')}`
    ).toEqual([]);
  });

  it('every case branch is listed in `# Commands:` header manifest', () => {
    const missing = diff(caseCmds, headerCmds!);
    expect(
      missing,
      `${missing.length} case branch(es) missing from header manifest — header drift since last subcommand add:\n  ${missing.join('\n  ')}`
    ).toEqual([]);
  });

  it('every header manifest entry maps to a case branch', () => {
    const missing = diff(headerCmds!, caseCmds);
    expect(
      missing,
      `${missing.length} header entry(ies) have no case branch — header lists removed commands:\n  ${missing.join('\n  ')}`
    ).toEqual([]);
  });
});
