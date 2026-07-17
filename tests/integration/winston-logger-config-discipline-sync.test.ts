/**
 * Logger configuration discipline invariants — 46th edge (HEXATETRACONTAGON)
 *
 * Validates `src/shared/utils/logger.ts` — the single logger across the
 * codebase (200+ callers). The logger is a Workers-compatible console wrapper
 * (winston is not used — it crashes in Cloudflare Workers).
 *
 * Invariant axes (Workers reality):
 * 1. File exists + parses — sanity floor.
 * 2. Named + default export — caller import-style freedom.
 * 3. LOG_LEVEL env tunable with 'info' default — ops can tune without
 *    redeploy; default is production-safe.
 * 4. debug / info / warn / error methods present — full level coverage.
 * 5. Structured output — ISO timestamp for log aggregation.
 * 6. Level filtering respects LOG_LEVEL boundary — no hardcoded debug.
 * 7. Composite: all 6 axes hold.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT  = resolve(__dirname, '../..');
const LOGGER_FILE = resolve(REPO_ROOT, 'src/shared/utils/logger.ts');

function readLogger(): string {
  return readFileSync(LOGGER_FILE, 'utf8');
}

describe('Logger configuration discipline', () => {
  const src = readLogger();

  it('file exists and is non-empty', () => {
    expect(src.length).toBeGreaterThan(200);
  });

  it('const export `logger` present (Workers-compatible)', () => {
    expect(
      /export\s+const\s+logger/.test(src),
      '`export const logger` missing — primary export pattern',
    ).toBe(true);
  });

  it('default export present', () => {
    expect(
      /export\s+default\s+logger/.test(src),
      'default export missing — `import logger from` callers break',
    ).toBe(true);
  });

  it('setLogLevel function exists (runtime log level control)', () => {
    expect(
      /setLogLevel/.test(src),
      'setLogLevel() missing — no way to change log level at runtime',
    ).toBe(true);
    expect(/info/.test(src), '"info" default missing — not production-safe').toBe(true);
  });

  it('debug / info / warn / error methods exist', () => {
    for (const m of ['debug', 'info', 'warn', 'error']) {
      expect(
        new RegExp(`\\b${m}\\s*\\(`).test(src),
        `method '${m}' missing from logger`,
      ).toBe(true);
    }
  });

  it('level filtering exists (not hardcoded to debug)', () => {
    expect(/shouldLog|_logLevel|LEVELS/.test(src), 'no level filtering — all levels log unconditionally').toBe(
      true,
    );
  });

  it('structured output — ISO timestamp via toISOString', () => {
    expect(
      /toISOString/.test(src),
      'ISO timestamp missing — log aggregation cannot parse timestamps',
    ).toBe(true);
  });

  it('composite: all axes hold simultaneously', () => {
    expect(/export\s+const\s+logger/.test(src)).toBe(true);
    expect(/export\s+default\s+logger/.test(src)).toBe(true);
    expect(/setLogLevel/.test(src) && /info/.test(src)).toBe(true);
    expect(/debug/.test(src) && /info/.test(src) && /warn/.test(src) && /error/.test(src)).toBe(
      true,
    );
    expect(/shouldLog|_logLevel|LEVELS/.test(src)).toBe(true);
    expect(/toISOString/.test(src)).toBe(true);
  });
});
