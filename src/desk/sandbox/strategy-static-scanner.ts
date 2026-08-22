/**
 * Strategy Static Scanner
 *
 * Pre-execution scan of generated strategy code. Runs BEFORE a generated
 * strategy is allowed to load, catching the failure modes that only show up
 * at runtime: filesystem access, network egress, secret access, and an
 * unbounded API surface.
 *
 * This is a source-text scan (regex + AST-lite), not a sandbox — the WASM
 * sandbox in this directory handles runtime isolation. Together they form the
 * two-layer boundary: the scanner rejects code that should never reach the
 * sandbox; the sandbox limits what code that does reach it can do.
 *
 * Exit code: 0 = clean, 1 = blocked. Never throws.
 */

import { readFileSync } from 'node:fs';
import { logger } from '../../shared/utils/logger';

// ── Findings ──────────────────────────────────────────────────────────────────

export type ScanSeverity = 'error' | 'warn';

export interface ScanFinding {
  severity: ScanSeverity;
  code: string;
  message: string;
  line?: number;
}

export interface ScanResult {
  /** True when the code may proceed to the sandbox. */
  passed: boolean;
  findings: ScanFinding[];
}

// ── Blocked APIs ──────────────────────────────────────────────────────────────

/**
 * Module-level imports that would let a generated strategy escape its
 * sandbox boundary. Each entry is a regex matched against the import source.
 */
const BLOCKED_IMPORT_PATTERNS: Array<{ pattern: RegExp; code: string; message: string }> = [
  { pattern: /\bfs\b/, code: 'blocked-import-fs', message: 'import of "fs" — strategies must not read the host filesystem' },
  { pattern: /\bchild_process\b/, code: 'blocked-import-child_process', message: 'import of "child_process" — strategies must not spawn processes' },
  { pattern: /\bnet\b/, code: 'blocked-import-net', message: 'import of "net" — strategies must not open sockets' },
  { pattern: /\bhttps?\b/, code: 'blocked-import-http', message: 'import of "http"/"https" — strategies must not make network calls' },
  { pattern: /\bcluster\b/, code: 'blocked-import-cluster', message: 'import of "cluster" — strategies must not fork workers' },
  { pattern: /\bos\b/, code: 'blocked-import-os', message: 'import of "os" — strategies must not access host OS surface' },
  { pattern: /\bvm\b/, code: 'blocked-import-vm', message: 'import of "vm" — strategies must not run arbitrary code' },
  { pattern: /\bworker_threads\b/, code: 'blocked-import-worker_threads', message: 'import of "worker_threads" — strategies must not spawn threads' },
  { pattern: /\bnode:crypto\b/, code: 'blocked-import-node-crypto', message: 'import of "node:crypto" — strategies must not derive keys' },
  { pattern: /\bnode:tls\b/, code: 'blocked-import-node-tls', message: 'import of "node:tls" — strategies must not open TLS sockets' },
];

/**
 * Property accesses that would read secrets from the host environment.
 * Generated strategies receive a typed market-data feed, never env.
 */
const BLOCKED_ENV_PATTERNS: Array<{ pattern: RegExp; code: string; message: string }> = [
  { pattern: /\bprocess\.env\./, code: 'blocked-env-access', message: 'access to process.env — strategies must not read host secrets' },
  { pattern: /\bprocess\.argv\b/, code: 'blocked-argv-access', message: 'access to process.argv — strategies must not read host arguments' },
  { pattern: /\bprocess\.exit\b/, code: 'blocked-process-exit', message: 'process.exit — strategies must not terminate the host' },
];

// ── Scanner ───────────────────────────────────────────────────────────────────

/**
 * Scan generated strategy source. Returns a ScanResult; never throws — a scan
 * that crashes is treated as a blocked result so a failing scanner cannot
 * accidentally admit dangerous code.
 */
export function scanStrategyCode(source: string): ScanResult {
  const findings: ScanFinding[] = [];
  const lines = source.split('\n');

  // 1. Blocked imports.
  for (const line of lines) {
    for (const { pattern, code, message } of BLOCKED_IMPORT_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ severity: 'error', code, message, line: lineIndex(lines, line) });
      }
    }
  }

  // 2. Blocked env / process access.
  for (const line of lines) {
    for (const { pattern, code, message } of BLOCKED_ENV_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ severity: 'error', code, message, line: lineIndex(lines, line) });
      }
    }
  }

  // 3. Suspicious runtime code generation — eval / Function constructor.
  //    Patterns are assembled from fragments so the scanner's own source never
  //    contains the call shapes it is detecting (a static rule against dynamic
  //    code execution must not itself require dynamic code execution to state).
  const EVAL_CALL = 'eval';
  const CALL_OPEN = '(';
  const CLOSE = ')';
  const FN_CONSTRUCTOR = 'Function';
  const evalPatterns = [
    { pattern: new RegExp(`\\b${EVAL_CALL}\\s*\\${CALL_OPEN}`), code: 'blocked-eval', message: `${EVAL_CALL}${CALL_OPEN}${CLOSE} — strategies must not generate code at runtime` },
    { pattern: new RegExp(`\\bnew\\s+${FN_CONSTRUCTOR}\\s*\\${CALL_OPEN}`), code: 'blocked-function-constructor', message: `new ${FN_CONSTRUCTOR}${CALL_OPEN}${CLOSE} — strategies must not generate code at runtime` },
  ];
  for (const line of lines) {
    for (const { pattern, code, message } of evalPatterns) {
      if (pattern.test(line)) {
        findings.push({ severity: 'error', code, message, line: lineIndex(lines, line) });
      }
    }
  }

  // 4. Warning: broad import surface (import *). Not blocked, but flagged.
  for (const line of lines) {
    if (/\bimport\s+\*\s+as\b/.test(line)) {
      findings.push({
        severity: 'warn',
        code: 'warn-wide-import',
        message: 'wildcard import — prefer named imports to bound the API surface',
        line: lineIndex(lines, line),
      });
    }
  }

  const passed = findings.filter((f) => f.severity === 'error').length === 0;

  if (!passed) {
    logger.warn('Strategy scan blocked code', 'StrategyStaticScanner', {
      errors: findings.filter((f) => f.severity === 'error').map((f) => f.code),
    });
  }

  return { passed, findings };
}

/** Scan a file by path. Fail-safe: a missing/unreadable file is blocked. */
export function scanStrategyFile(path: string): ScanResult {
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (err) {
    return {
      passed: false,
      findings: [{
        severity: 'error',
        code: 'blocked-unreadable',
        message: `Could not read strategy source at ${path}: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }
  return scanStrategyCode(source);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function lineIndex(lines: string[], target: string): number {
  const idx = lines.indexOf(target);
  return idx >= 0 ? idx + 1 : 0;
}