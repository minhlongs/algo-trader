/**
 * Research MCP Server — Experiments, Tools, and Server Factory Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { __setGate } from '../../middleware/signal-tier-resolver';
import {
  handleListExperiments,
  handleListTools,
  createResearchMcpServer,
  RESEARCH_MCP_TOOLS,
} from '../research-mcp-server';

const { paths } = vi.hoisted(() => ({ paths: { ledger: '' } }));

vi.mock('../../../alpha-lab/provenance/research-ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../alpha-lab/provenance/research-ledger')>();
  return {
    ...actual,
    readLedgerRecords: (p?: string) => actual.readLedgerRecords(p ?? paths.ledger),
  };
});

function fakeLicense(tier: string, userId = 'user-1') {
  return { id: 'lic-1', userId, tier, active: true };
}
const FREE_GATE = { validateApiKey: (k: string) => (k ? fakeLicense('FREE') : undefined) };
const PRO_GATE = { validateApiKey: (k: string) => (k ? fakeLicense('PRO') : undefined) };

let ledgerDir: string;
beforeEach(async () => {
  ledgerDir = await mkdtemp(join(tmpdir(), 'research-mcp-exp-'));
  paths.ledger = join(ledgerDir, 'research-ledger.jsonl');
});
afterEach(async () => {
  await rm(ledgerDir, { recursive: true, force: true });
});

function ledgerRecord(runId: string, prevHash = '') {
  return JSON.stringify({
    runId,
    strategyRef: 'rsi-momentum',
    resultClass: 'IS',
    configHash: 'cfg-' + runId,
    recordedAt: '2026-01-01T00:00:00Z',
    gates: { backtest: 'PASS', oos: 'PASS' },
    prevHash,
  });
}

describe('handleListExperiments', () => {
  it('returns isError when apiKey is missing', async () => {
    const result = await handleListExperiments({ apiKey: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns unauthorized for invalid key', async () => {
    __setGate({ validateApiKey: () => undefined });
    try {
      const result = await handleListExperiments({ apiKey: 'bad' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unauthorized');
    } finally {
      __setGate(null);
    }
  });

  it('returns insufficient tier for FREE tier', async () => {
    __setGate(FREE_GATE);
    try {
      const result = await handleListExperiments({ apiKey: 'free-key' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Insufficient tier');
    } finally {
      __setGate(null);
    }
  });

  it('returns runs from the ledger for PRO tier', async () => {
    __setGate(PRO_GATE);
    try {
      await writeFile(paths.ledger, [ledgerRecord('run-1'), ledgerRecord('run-2', 'hash-1')].join('\n'));
      const result = await handleListExperiments({ apiKey: 'pro-key', limit: 10 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runs.length).toBe(2);
      expect(parsed.runs[0].runId).toBe('run-2');
      expect(parsed.runs[1].runId).toBe('run-1');
      expect(typeof parsed.chainIntact).toBe('boolean');
      expect(parsed.count).toBe(2);
    } finally {
      __setGate(null);
    }
  });

  it('returns empty runs for PRO tier when ledger does not exist', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleListExperiments({ apiKey: 'pro-key' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runs).toEqual([]);
      expect(parsed.total).toBe(0);
      expect(parsed.chainIntact).toBe(true);
    } finally {
      __setGate(null);
    }
  });
});

describe('handleListTools', () => {
  it('returns 4 tools', () => {
    const { tools } = handleListTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual(['list_experiments', 'get_run_card', 'get_alpha_report', 'get_backtest_summary']);
  });

  it('all tools are read-only (no order-placing)', () => {
    for (const tool of handleListTools().tools) expect(tool.description).toContain('Read-only');
  });

  it('all tools declare annotations.readOnlyHint === true', () => {
    for (const tool of handleListTools().tools) expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe('createResearchMcpServer & RESEARCH_MCP_TOOLS', () => {
  it('creates a server with tools capability', () => {
    expect(createResearchMcpServer()).toBeDefined();
  });

  it('is a non-empty array of Tool objects', () => {
    expect(Array.isArray(RESEARCH_MCP_TOOLS)).toBe(true);
    expect(RESEARCH_MCP_TOOLS.length).toBe(4);
  });

  it('each tool has required fields', () => {
    for (const tool of RESEARCH_MCP_TOOLS) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.properties?.apiKey).toBeDefined();
    }
  });

  it('every tool carries the MCP readOnlyHint annotation', () => {
    for (const tool of RESEARCH_MCP_TOOLS) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });
});
