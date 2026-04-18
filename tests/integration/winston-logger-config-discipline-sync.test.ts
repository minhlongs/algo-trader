/**
 * Winston logger configuration discipline 7-invariant sync — first
 * structured-logging substrate edge.
 *
 * `src/utils/logger.ts` is the single logger exported across the
 * codebase (>200 callers). Drift manifests as:
 *   - Log level dropped from env-configurable to hardcoded `'debug'` →
 *     production log bloat + cost + noise
 *   - JSON format lost in production → log-aggregation (Sentry,
 *     CloudWatch, ELK) cannot parse key fields
 *   - File transports lose rotation bounds → disk fills in 2 weeks
 *   - Default export removed → callers using `import logger from` break
 *
 * Unlike the 45 prior edges (29 families):
 *   - Prior 29 cover DB schemas, metrics, Dockerfile, tsconfig, vitest,
 *     gitignore, package.json, Express security/error/health, etc.
 *     None locks the LOGGER config.
 *   - **NEW family #30: WINSTON LOGGER CONFIGURATION DISCIPLINE.**
 *     First structured-logging substrate edge.
 *
 * The invariant is declared across 1 file × 7 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **winston import + createLogger usage** — baseline.
 *   3. **Level from `LOG_LEVEL` env with `'info'` default** — ops can
 *      tune without redeploy; default is production-safe.
 *   4. **Format: JSON in production, simple+colorize in dev** —
 *      log-aggregation requires JSON; dev terminal prefers colorized
 *      text.
 *   5. **Console transport always present** — stdout logging baseline
 *      (Docker + systemd + CI all read stdout).
 *   6. **File transports production-only** — `error.log` + `combined.log`
 *      gated on `NODE_ENV === 'production'`; dev does not pollute disk.
 *   7. **Rotation bounds** — `maxsize` and `maxFiles` set on every file
 *      transport (disk-exhaustion prevention).
 *   8. **Named + default export** — `export { logger }` AND `export
 *      default logger` both present (caller import-style independence).
 *
 * Novel invariants locked (family #30):
 *   - **Env-tunable level** — `LOG_LEVEL` override prevents redeploy-
 *     to-debug cycle during incident response.
 *   - **JSON-in-production** — log-aggregator contract (Sentry requires
 *     JSON; CloudWatch auto-parses JSON).
 *   - **File-transport rotation** — maxsize + maxFiles together bound
 *     disk usage. Drop either = disk-fills alert or log churn.
 *
 * Drift scenarios covered:
 *   - Developer hardcodes `level: 'debug'` for "easier local dev" →
 *     case 3 fails.
 *   - Dev format used in production during "simplify logger" PR →
 *     case 4 fails (JSON-in-production).
 *   - File transport added without maxsize → case 7 fails (disk
 *     exhaustion risk).
 *
 * Symmetric to prior integrity edges:
 *   #186 Express security middleware (uses `logger`).
 *   #188 Error-handler (calls `logger.error`) — drift here would
 *   silently break 5xx audit trail locked by #188.
 *
 * Opens the **46th integrity edge — HEXATETRACONTAGON** (46-gon). First
 * structured-logging substrate edge. Novel family #30. Integrity
 * pentatetracontagon → hexatetracontagon (46-gon).
 *
 * Non-goals: asserting specific log format shape (depends on Winston
 * version); HTTP-integration check (out of scope); log redaction
 * patterns (separate concern — future edge).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const LOGGER_FILE = resolve(REPO_ROOT, 'src/utils/logger.ts');

const MIN_MAXSIZE_BYTES = 1_000_000;
const MIN_MAXFILES = 7;

function readLogger(): string {
  return readFileSync(LOGGER_FILE, 'utf8');
}

describe('Winston logger configuration discipline — 46th edge (HEXATETRACONTAGON)', () => {
  const src = readLogger();

  it('logger.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(200);
  });

  it('winston imported and createLogger called', () => {
    expect(
      /import\s+winston\s+from\s+['"]winston['"]/.test(src),
      'winston import missing — logger wont construct',
    ).toBe(true);
    expect(
      /winston\.createLogger\(/.test(src),
      'winston.createLogger() not invoked — logger not created',
    ).toBe(true);
  });

  it('level resolved from LOG_LEVEL env with "info" default (env-tunable)', () => {
    expect(
      /level\s*:\s*process\.env\.LOG_LEVEL\s*\|\|\s*['"]info['"]/.test(src),
      'level must resolve from process.env.LOG_LEVEL with "info" default — ops tunability + prod-safe default',
    ).toBe(true);
  });

  it('format: JSON in production, simple+colorize in dev (aggregator contract)', () => {
    expect(
      /process\.env\.NODE_ENV\s*===\s*['"]production['"]/.test(src),
      'NODE_ENV production check missing — cannot branch format by env',
    ).toBe(true);
    expect(
      /winston\.format\.json\(\)/.test(src),
      'winston.format.json() not used — log aggregator cant parse fields',
    ).toBe(true);
    expect(
      /winston\.format\.colorize\(\)/.test(src),
      'winston.format.colorize() missing for dev — terminal readability lost',
    ).toBe(true);
    expect(
      /winston\.format\.simple\(\)/.test(src),
      'winston.format.simple() missing for dev — fallback text format absent',
    ).toBe(true);
  });

  it('Console transport always present (stdout baseline)', () => {
    expect(
      /new\s+winston\.transports\.Console\(/.test(src),
      'winston.transports.Console not constructed — stdout logging lost; Docker/systemd/CI would see nothing',
    ).toBe(true);
  });

  it('File transports are production-only (NODE_ENV===production gate)', () => {
    // Match the NODE_ENV gate preceding File transport construction.
    const fileTransportIdx = src.indexOf('winston.transports.File');
    expect(fileTransportIdx, 'winston.transports.File missing — log persistence lost').toBeGreaterThan(-1);
    const precedingSlice = src.slice(0, fileTransportIdx);
    expect(
      /process\.env\.NODE_ENV\s*===\s*['"]production['"]/.test(precedingSlice),
      'file transports not gated on NODE_ENV===production — dev environment would pollute disk',
    ).toBe(true);
  });

  it('rotation bounds: maxsize + maxFiles on every file transport (disk-exhaustion prevention)', () => {
    // Extract every File transport block; each must have maxsize AND maxFiles.
    const blocks = [...src.matchAll(/new\s+winston\.transports\.File\(\s*\{([^}]+)\}\s*\)/g)];
    expect(blocks.length, 'no File transport blocks parsed — regex miss or transports absent').toBeGreaterThan(0);
    for (const m of blocks) {
      const body = m[1];
      const maxsize = /maxsize\s*:\s*(\d[\d_]*)/.exec(body);
      const maxFiles = /maxFiles\s*:\s*(\d+)/.exec(body);
      expect(maxsize, `File transport missing maxsize: ${body.trim()}`).not.toBeNull();
      expect(maxFiles, `File transport missing maxFiles: ${body.trim()}`).not.toBeNull();
      if (maxsize && maxFiles) {
        const bytes = Number(maxsize[1].replace(/_/g, ''));
        const files = Number(maxFiles[1]);
        expect(
          bytes >= MIN_MAXSIZE_BYTES,
          `maxsize=${bytes} < ${MIN_MAXSIZE_BYTES} (1MB floor) — rotation too aggressive`,
        ).toBe(true);
        expect(
          files >= MIN_MAXFILES,
          `maxFiles=${files} < ${MIN_MAXFILES} — retention too short for incident forensics`,
        ).toBe(true);
      }
    }
  });

  it('error.log and combined.log file transports both present', () => {
    expect(
      /filename\s*:\s*['"]logs\/error\.log['"]/.test(src),
      'logs/error.log transport missing — ERROR-level persistence lost',
    ).toBe(true);
    expect(
      /filename\s*:\s*['"]logs\/combined\.log['"]/.test(src),
      'logs/combined.log transport missing — full-level persistence lost',
    ).toBe(true);
    expect(
      /level\s*:\s*['"]error['"]/.test(src),
      'error.log transport must set level:"error" — otherwise records ALL levels',
    ).toBe(true);
  });

  it('both named export `{ logger }` and `export default logger` present', () => {
    expect(
      /export\s+\{\s*logger\s*\}/.test(src),
      'named export `{ logger }` missing — `import { logger }` callers break',
    ).toBe(true);
    expect(
      /export\s+default\s+logger/.test(src),
      'default export missing — `import logger from` callers break',
    ).toBe(true);
  });

  it('composite: 7 axes hold simultaneously (logger-config coherence)', () => {
    expect(/winston\.createLogger\(/.test(src)).toBe(true);
    expect(/level\s*:\s*process\.env\.LOG_LEVEL\s*\|\|\s*['"]info['"]/.test(src)).toBe(true);
    expect(/winston\.format\.json\(\)/.test(src) && /winston\.format\.colorize\(\)/.test(src)).toBe(true);
    expect(/new\s+winston\.transports\.Console\(/.test(src)).toBe(true);
    expect(/new\s+winston\.transports\.File\(/.test(src)).toBe(true);
    expect(/export\s+\{\s*logger\s*\}/.test(src) && /export\s+default\s+logger/.test(src)).toBe(true);
  });
});
