/**
 * Research MCP Server tests
 *
 * Covers: all 4 handlers (list_experiments, get_run_card, get_alpha_report,
 * get_backtest_summary), auth gates (missing apiKey, unauthorized, insufficient
 * tier), happy paths, empty ledger, chain integrity, not-found paths, and
 * handleListTools + createResearchMcpServer exports.
 *
 * Isolation: the three provenance stores are mocked as pass-throughs of their
 * real implementations with default roots redirected into a per-test tmpdir,
 * so no test ever reads or writes the repository */

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

// ── Redirected provenance paths (hoisted mutable state) ──────────────────────

const { paths } = vi.hoisted(() => ({
  paths: { ledger: '', runRoots: [] as string[], alphaReports: '' },
}));

vi.mock('../../../alpha-lab/provenance/research-ledger', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../alpha-lab/provenance/research-ledger')>();
  return {
    ...actual,
    readLedgerRecords: (ledgerPath?: string) =>
      actual.readLedgerRecords(ledgerPath ?? paths.ledger),
  };
});

vi.mock('../../../alpha-lab/provenance/run-card-index', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../alpha-lab/provenance/run-card-index')>();
  return {
    ...actual,
    readRunCardByRunId: (runId: string, roots?: string[]) =>
      actual.readRunCardByRunId(runId, roots ?? paths.runRoots),
  };
});

vi.mock('../../../alpha-lab/provenance/alpha-report-store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../alpha-lab/provenance/alpha-report-store')>();
  return {
    ...actual,
    readAlphaReportByCandidateId: (candidateId: string, root?: string) =>
      actual.readAlphaReportByCandidateId(candidateId, root ?? paths.alphaReports),
  };
});

// ── Test gate ────────────────────────────────────────────────────────────────

function fakeLicense(tier: string, userId = 'user-1') {
  return { id: 'lic-1', userId, tier, active: true };
}

const FREE_GATE = { validateApiKey: (k: string) => k ? fakeLicense('FREE') : undefined };
const PRO_GATE = { validateApiKey: (k: string) => k ? fakeLicense('PRO') : undefined };

// ── Tmpdir fixtures ──────────────────────────────────────────────────────────

let ledgerDir: string;

beforeEach(async () => {
  ledgerDir = await mkdtemp(join(tmpdir(), 'research-mcp-test-'));
  paths.ledger = join(ledgerDir, 'research-ledger.jsonl');
  paths.runRoots = [join(ledgerDir, 'runs')];
  paths.alphaReports = join(ledgerDir, 'alpha-reports');
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

function runCard(runId: string, metrics: Record<string, number>) {
  return {
    runId,
    strategyRef: 'rsi-strat',
    resultClass: 'IS',
    configHash: 'h-' + runId,
    createdAt: '2026-01-01T00:00:00Z',
    metrics,
    gateResults: [],
    warnings: [],
  };
}

async function seedRunCard(card: ReturnType<typeof runCard>): Promise<void> {
  await mkdir(paths.runRoots[0], { recursive: true });
  await writeFile(join(paths.runRoots[0], 'run_card.json'), JSON.stringify(card));
}

// ── handleListExperiments ─────────────────────────────────────────────────────

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
      await writeFile(
        paths.ledger,
        [ledgerRecord('run-1'), ledgerRecord('run-2', 'hash-1')].join('\n'),
      );

      const result = await handleListExperiments({ apiKey: 'pro-key', limit: 10 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runs.length).toBe(2);
      expect(parsed.runs[0].runId).toBe('run-2'); // most recent first
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
      // paths.ledger points at a nonexistent tmp file; readLedgerRecords returns []
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
    __setGate({ validateApiKey: () => undefined });
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
    try {
      const card = runCard('run-7', { sharpe: 1.0 });
      await seedRunCard(card);

      const result = await handleGetRunCard({ apiKey: 'pro', runId: 'run-7' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runId).toBe('run-7');
      expect(parsed.strategyRef).toBe('rsi-strat');
      expect(parsed.metrics.sharpe).toBe(1.0);
    } finally {
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
    __setGate({ validateApiKey: () => undefined });
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

  it('returns the alpha report when found in the store', async () => {
    __setGate(PRO_GATE);
    try {
      const verdict = { passed: true, failedCriteria: [], comparisons: [], recommendation: 'PASS' };
      await mkdir(paths.alphaReports, { recursive: true });
      await writeFile(
        join(paths.alphaReports, 'candidate-ok.json'),
        JSON.stringify({ candidateId: 'candidate-ok', verdict, createdAt: '2026-03-01T00:00:00Z' }),
      );

      const result = await handleGetAlphaReport({ apiKey: 'pro', candidateId: 'candidate-ok' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.candidateId).toBe('candidate-ok');
      expect(parsed.verdict.passed).toBe(true);
      expect(parsed.createdAt).toBe('2026-03-01T00:00:00Z');
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
    __setGate({ validateApiKey: () => undefined });
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
    try {
      const card = runCard('run-5', { sharpe: 1.5, maxDrawdown: -0.05, winRate: 0.6, tradeCount: 42 });
      card.resultClass = 'OOS';
      await seedRunCard(card);

      const result = await handleGetBacktestSummary({ apiKey: 'pro', runId: 'run-5' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runId).toBe('run-5');
      expect(parsed.resultClass).toBe('OOS');
      expect(parsed.metrics.sharpe).toBe(1.5);
      expect(parsed.metrics.tradeCount).toBe(42);
    } finally {
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

  it('all tools declare annotations.readOnlyHint === true', () => {
    const { tools } = handleListTools();
    expect(tools).toHaveLength(4);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
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

  it('every tool carries the MCP readOnlyHint annotation', () => {
    for (const tool of RESEARCH_MCP_TOOLS) {
      expect(tool.annotations).toBeDefined();
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });
});
