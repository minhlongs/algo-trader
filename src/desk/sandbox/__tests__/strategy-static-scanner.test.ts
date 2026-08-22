/**
 * Strategy static scanner tests — covers blocked imports, env access, eval,
 * wildcard-import warnings, and the fail-safe unreadable-file path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanStrategyCode, scanStrategyFile } from '../strategy-static-scanner';

const CLEAN = `
/**
 * A clean generated strategy — only typed market data and math.
 */
export function decide(prices: number[]): 'buy' | 'sell' | 'hold' {
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const last = prices[prices.length - 1];
  if (last > avg * 1.01) return 'buy';
  if (last < avg * 0.99) return 'sell';
  return 'hold';
}
`;

// ── scanStrategyCode ──────────────────────────────────────────────────────────

describe('scanStrategyCode', () => {
  it('passes clean code', () => {
    const result = scanStrategyCode(CLEAN);
    expect(result.passed).toBe(true);
    expect(result.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('blocks fs import', () => {
    const result = scanStrategyCode('import { readFileSync } from "fs";');
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === 'blocked-import-fs')).toBe(true);
  });

  it('blocks child_process import', () => {
    const result = scanStrategyCode('const cp = require("child_process");');
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === 'blocked-import-child_process')).toBe(true);
  });

  it('blocks net import', () => {
    const result = scanStrategyCode('import net from "net";');
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === 'blocked-import-net')).toBe(true);
  });

  it('blocks http/https import', () => {
    const result = scanStrategyCode('import http from "http";');
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === 'blocked-import-http')).toBe(true);
  });

  it('blocks process.env access', () => {
    const result = scanStrategyCode('const key = process.env.SECRET_KEY;');
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === 'blocked-env-access')).toBe(true);
  });

  it('blocks process.exit', () => {
    const result = scanStrategyCode('process.exit(0);');
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === 'blocked-process-exit')).toBe(true);
  });

  it('blocks eval()', () => {
    const result = scanStrategyCode('eval("1+1");');
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === 'blocked-eval')).toBe(true);
  });

  it('blocks new Function()', () => {
    const result = scanStrategyCode('const f = new Function("return 1");');
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === 'blocked-function-constructor')).toBe(true);
  });

  it('warns on wildcard imports but does not block', () => {
    const result = scanStrategyCode('import * as fs from "fs";');
    // fs is blocked (error) AND wildcard import is warned.
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.code === 'warn-wide-import')).toBe(true);
  });

  it('warns on wildcard import alone', () => {
    const result = scanStrategyCode('import * as math from "math";');
    expect(result.passed).toBe(true);
    expect(result.findings.some((f) => f.code === 'warn-wide-import' && f.severity === 'warn')).toBe(true);
  });

  it('records line numbers', () => {
    const source = 'line1\nline2\nimport { x } from "fs";\n';
    const result = scanStrategyCode(source);
    const fs = result.findings.find((f) => f.code === 'blocked-import-fs');
    expect(fs?.line).toBe(3);
  });

  it('never throws on empty source', () => {
    const result = scanStrategyCode('');
    expect(result.passed).toBe(true);
  });
});

// ── scanStrategyFile ──────────────────────────────────────────────────────────

describe('scanStrategyFile', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'scan-'));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('scans a clean file from disk', async () => {
    const p = join(tmp, 'clean.ts');
    await writeFile(p, CLEAN, 'utf8');
    const result = await scanStrategyFile(p);
    expect(result.passed).toBe(true);
  });

  it('blocks a file containing process.env', async () => {
    const p = join(tmp, 'bad.ts');
    await writeFile(p, 'const k = process.env.KEY;', 'utf8');
    const result = await scanStrategyFile(p);
    expect(result.passed).toBe(false);
  });

  it('fails safe on an unreadable file', async () => {
    const result = await scanStrategyFile(join(tmp, 'does-not-exist.ts'));
    expect(result.passed).toBe(false);
    expect(result.findings[0].code).toBe('blocked-unreadable');
  });
});