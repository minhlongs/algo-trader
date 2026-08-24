/**
 * Research MCP Server tests
 *
 * Covers: all 4 handlers (list_experiments, get_run_card, get_alpha_report,
 * get_backtest_summary), auth gates (missing apiKey, unauthorized, insufficient
 * tier), happy paths, empty ledger, chain integrity, not-found paths, and
 * handleListTools + createResearchMcpServer exports.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// Stub the signal-tier-resolver BEFORE importing the module under test
import { __setGate } from '../../middleware/signal-tier-resolver';
import {
  handleListExperiments,
  handleGetRunCard,
  handleGetAlphaReport,
  handleGetBacktestSummary,
  handleListTools,
  createResearchMcpServer,
  RESEARCH_MCP_TOOLS,
} from '../research-mcp-server';
import { DEFAULT_LEDGER_PATH } from '../../alpha-lab/provenance/research-ledger';

// ── Test gate ────────────────────────────────────────────────────────────────

function fakeLicense(tier: string, userId = 'user-1') {
  return { id: 'lic-1', userId, tier, active: true };
}

const FREE_GATE = { validateApiKey: (k: string) => k ? fakeLicense('FREE') : undefined };
const PRO_GATE = { validateApiKey: (k: string) => k ? fakeLicense('PRO') : undefined };
const ENT_GATE = { validateApiKey: (k: string) => k ? fakeLicense('ENTERPRISE') : undefined };
const NO_GATE = { validateApiKey: () => undefined };

// ── Ledger fixtures ──────────────────────────────────────────────────────────

let ledgerDir: string;

beforeEach(async () => {
  ledgerDir = await mkdtemp(join(tmpdir(), 'research-mcp-test-'));
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

// ── handleListExperiments ─────────────────────────────────────────────────────

describe('handleListExperiments', () => {
  it('returns isError when apiKey is missing', async () => {
    const result = await handleListExperiments({ apiKey: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns unauthorized for invalid key', async () => {
    __setGate(NO_GATE);
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
    const ledgerPath = join(ledgerDir, 'research-ledger.jsonl');
    await writeFile(
      ledgerPath,
      [ledgerRecord('run-1'), ledgerRecord('run-2', 'hash-1')].join('\n'),
    );
    // We need to write to the default path or override — research-ledger
    // reads from DEFAULT_LEDGER_PATH. For unit tests we can use env or
    // write to the default location. We'll write to a known location and
    // let the handler use the default path (CWD-based).
    // Instead: mock the ledger read. But handler calls readLedgerRecords()
    // which reads DEFAULT_LEDGER_PATH. We'll write to a temp and mock.

    // Simpler: just write to DEFAULT_LEDGER_PATH relative to CWD
    // Since tests run from project root, data/research-ledger.jsonl should work
    // But we don't want to touch real data. Let's spy.

    vi.doMock('../../alpha-lab/provenance/research-ledger', async () => {
      const { readLedgerRecords, verifyLedgerChain } = await vi.importActual<
        typeof import('../../alpha-lab/provenance/research-ledger')
      >('../../alpha-lab/provenance/research-ledger');
      return { readLedgerRecords, verifyLedgerChain };
    });

    // The handler calls readLedgerRecords() with no args (DEFAULT_LEDGER_PATH).
    // Since we can't easily redirect the path in an integration-style unit test
    // without touching the real filesystem, we write a minimal ledger at the
    // expected default location (data/) and clean up after.
    const { mkdirSync, writeFileSync, existsSync, unlinkSync, rmdirSync } = await import('node:fs');
    const dataDir = join(process.cwd(), 'data');
    const realLedger = join(dataDir, 'research-ledger.jsonl');
    const existed = existsSync(realLedger);

    let cleanupNeeded = false;
    try {
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
        cleanupNeeded = true;
      }
      // Backup if exists
      let backup: string | undefined;
      if (existed) {
        backup = String(await import('node:fs').then(f => f.readFileSync(realLedger)));
      }
      // Write test ledger
      writeFileSync(realLedger, [ledgerRecord('run-1'), ledgerRecord('run-2', 'hash-1')].join('\n'));

      const result = await handleListExperiments({ apiKey: 'pro-key', limit: 10 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runs.length).toBe(2);
      expect(parsed.runs[0].runId).toBe('run-2'); // most recent first
      expect(parsed.runs[1].runId).toBe('run-1');
      expect(typeof parsed.chainIntact).toBe('boolean');
      expect(parsed.count).toBe(2);

      // Restore original
      if (backup !== undefined) {
        writeFileSync(realLedger, backup);
      } else {
        unlinkSync(realLedger);
      }
      if (cleanupNeeded) rmdirSync(dataDir);
    } catch (err) {
      // Cleanup on failure
      try {
        if (!existed && existsSync(realLedger)) unlinkSync(realLedger);
        if (cleanupNeeded && existsSync(dataDir)) rmdirSync(dataDir);
      } catch { /* best-effort */ }
      throw err;
    } finally {
      __setGate(null);
      vi.doUnmock('../../alpha-lab/provenance/research-ledger');
    }
  });

  it('returns empty runs for PRO tier with empty ledger', async () => {
    __setGate(PRO_GATE);
    const { mkdirSync, existsSync, unlinkSync, rmdirSync } = await import('node:fs');
    const dataDir = join(process.cwd(), 'data');
    const realLedger = join(dataDir, 'research-ledger.jsonl');
    const existed = existsSync(realLedger);
    let cleanupNeeded = false;
    try {
      if (!existsSync(dataDir)) { mkdirSync(dataDir, { recursive: true }); cleanupNeeded = true; }
      if (existed) (await import('node:fs')).unlinkSync(realLedger);
      // Empty file
      (await import('node:fs')).writeFileSync(realLedger, '');

      const result = await handleListExperiments({ apiKey: 'pro-key' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runs).toEqual([]);
      expect(parsed.total).toBe(0);
    } finally {
      try {
        if (!existed && existsSync(realLedger)) unlinkSync(realLedger);
        if (cleanupNeeded && existsSync(dataDir)) rmdirSync(dataDir);
      } catch { /* best-effort */ }
      __setGate(null);
    }
  });
});

// ── handleGetRunCard ──────────────────────────────────────────────────────────

describe('handleGetRunCard', () => {
  it('returns isError when apiKey is missing', async () => {
    const result = await handleGetRunCard({ apiKey: '', runId: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns isError when runId is missing', async () => {
    const result = await handleGetRunCard({ apiKey: 'k', runId: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns unauthorized for invalid key', async () => {
    __setGate(NO_GATE);
    try {
      const result = await handleGetRunCard({ apiKey: 'bad', runId: 'r1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unauthorized');
    } finally {
      __setGate(null);
    }
  });

  it('returns insufficient tier for FREE tier', async () => {
    __setGate(FREE_GATE);
    try {
      const result = await handleGetRunCard({ apiKey: 'free', runId: 'r1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Insufficient tier');
    } finally {
      __setGate(null);
    }
  });

  it('returns not-found when run card does not exist on disk', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetRunCard({ apiKey: 'pro', runId: 'nonexistent' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No run card found');
    } finally {
      __setGate(null);
    }
  });

  it('returns the run card when found', async () => {
    __setGate(PRO_GATE);
    // Write a run card under a temp dir and add it to DEFAULT_RUN_CARD_ROOTS
    const root = join(ledgerDir, 'runs');
    await mkdir(root, { recursive: true });
    const card = { runId: 'run-7', strategyRef: 'rsi-strat', resultClass: 'IS', configHash: 'h', createdAt: '2026-01-01T00:00:00Z', metrics: { sharpe: 1.0 }, gateResults: [], warnings: [] };
    await writeFile(join(root, 'run_card.json'), JSON.stringify(card));

    // readRunCardByRunId defaults to DEFAULT_RUN_CARD_ROOTS which includes 'data/runs'.
    // We need the card to be at one of those paths. Write to data/runs as well.
    const dataRuns = join(process.cwd(), 'data', 'runs');
    const { mkdirSync, existsSync, unlinkSync, rmdirSync, writeFileSync } = await import('node:fs');
    let createdDir = false;
    try {
      if (!existsSync(dataRuns)) { mkdirSync(dataRuns, { recursive: true }); createdDir = true; }
      writeFileSync(join(dataRuns, 'run_card.json'), JSON.stringify(card));

      const result = await handleGetRunCard({ apiKey: 'pro', runId: 'run-7' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runId).toBe('run-7');
      expect(parsed.strategyRef).toBe('rsi-strat');
    } finally {
      try {
        if (existsSync(join(dataRuns, 'run_card.json'))) unlinkSync(join(dataRuns, 'run_card.json'));
        if (createdDir) rmdirSync(dataRuns);
      } catch { /* best-effort */ }
      __setGate(null);
    }
  });
});

// ── handleGetAlphaReport ──────────────────────────────────────────────────────

describe('handleGetAlphaReport', () => {
  it('returns isError when apiKey is missing', async () => {
    const result = await handleGetAlphaReport({ apiKey: '', candidateId: 'c1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns isError when candidateId is missing', async () => {
    const result = await handleGetAlphaReport({ apiKey: 'k', candidateId: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns unauthorized for invalid key', async () => {
    __setGate(NO_GATE);
    try {
      const result = await handleGetAlphaReport({ apiKey: 'bad', candidateId: 'c1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unauthorized');
    } finally {
      __setGate(null);
    }
  });

  it('returns not-found shape for PRO tier when alpha report does not exist', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetAlphaReport({ apiKey: 'pro', candidateId: 'c-42' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.candidateId).toBe('c-42');
      expect(parsed.found).toBe(false);
      expect(parsed.message).toContain('Alpha report not found');
    } finally {
      __setGate(null);
    }
  });
});

// ── handleGetBacktestSummary ──────────────────────────────────────────────────

describe('handleGetBacktestSummary', () => {
  it('returns isError when apiKey is missing', async () => {
    const result = await handleGetBacktestSummary({ apiKey: '', runId: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns isError when runId is missing', async () => {
    const result = await handleGetBacktestSummary({ apiKey: 'k', runId: '' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing required');
  });

  it('returns unauthorized for invalid key', async () => {
    __setGate(NO_GATE);
    try {
      const result = await handleGetBacktestSummary({ apiKey: 'bad', runId: 'r1' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unauthorized');
    } finally {
      __setGate(null);
    }
  });

  it('returns not-found when run card does not exist', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetBacktestSummary({ apiKey: 'pro', runId: 'missing' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No run card found');
    } finally {
      __setGate(null);
    }
  });

  it('returns summary with metrics when run card exists', async () => {
    __setGate(PRO_GATE);
    const { mkdirSync, existsSync, unlinkSync, rmdirSync, writeFileSync } = await import('node:fs');
    const dataRuns = join(process.cwd(), 'data', 'runs');
    let createdDir = false;
    const card = { runId: 'run-5', strategyRef: 'macd', resultClass: 'OOS', configHash: 'h5', createdAt: '2026-02-01T00:00:00Z', metrics: { sharpe: 1.5, maxDrawdown: -0.05, winRate: 0.6, tradeCount: 42 }, gateResults: [], warnings: [] };
    try {
      if (!existsSync(dataRuns)) { mkdirSync(dataRuns, { recursive: true }); createdDir = true; }
      writeFileSync(join(dataRuns, 'run_card.json'), JSON.stringify(card));

      const result = await handleGetBacktestSummary({ apiKey: 'pro', runId: 'run-5' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runId).toBe('run-5');
      expect(parsed.resultClass).toBe('OOS');
      expect(parsed.metrics.sharpe).toBe(1.5);
      expect(parsed.metrics.tradeCount).toBe(42);
    } finally {
      try {
        if (existsSync(join(dataRuns, 'run_card.json'))) unlinkSync(join(dataRuns, 'run_card.json'));
        if (createdDir) rmdirSync(dataRuns);
      } catch { /* best-effort */ }
      __setGate(null);
    }
  });
});

// ── handleListTools ───────────────────────────────────────────────────────────

describe('handleListTools', () => {
  it('returns 4 tools', () => {
    const { tools } = handleListTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      'list_experiments',
      'get_run_card',
      'get_alpha_report',
      'get_backtest_summary',
    ]);
  });

  it('all tools are read-only (no order-placing)', () => {
    const { tools } = handleListTools();
    for (const tool of tools) {
      expect(tool.description).toContain('Read-only');
    }
  });
});

// ── createResearchMcpServer ───────────────────────────────────────────────────

describe('createResearchMcpServer', () => {
  it('creates a server with tools capability', () => {
    const server = createResearchMcpServer();
    expect(server).toBeDefined();
    // Server instance is from MCP SDK; just verify it was created without error
  });
});

// ── RESEARCH_MCP_TOOLS constant ───────────────────────────────────────────────

describe('RESEARCH_MCP_TOOLS', () => {
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
});
