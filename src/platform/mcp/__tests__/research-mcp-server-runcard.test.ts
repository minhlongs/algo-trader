/**
 * Research MCP Server — Run Card & Backtest Summary Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { __setGate } from '../../middleware/signal-tier-resolver';
import { handleGetRunCard, handleGetBacktestSummary } from '../research-mcp-server';

const { paths } = vi.hoisted(() => ({ paths: { runRoots: [] as string[] } }));

vi.mock('../../../alpha-lab/provenance/run-card-index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../alpha-lab/provenance/run-card-index')>();
  return {
    ...actual,
    readRunCardByRunId: (id: string, roots?: string[]) => actual.readRunCardByRunId(id, roots ?? paths.runRoots),
  };
});

function fakeLicense(tier: string, userId = 'user-1') {
  return { id: 'lic-1', userId, tier, active: true };
}
const FREE_GATE = { validateApiKey: (k: string) => (k ? fakeLicense('FREE') : undefined) };
const PRO_GATE = { validateApiKey: (k: string) => (k ? fakeLicense('PRO') : undefined) };

let ledgerDir: string;
beforeEach(async () => {
  ledgerDir = await mkdtemp(join(tmpdir(), 'research-mcp-rc-'));
  paths.runRoots = [join(ledgerDir, 'runs')];
});
afterEach(async () => {
  await rm(ledgerDir, { recursive: true, force: true });
});

function runCard(runId: string, metrics: Record<string, number>, resultClass = 'IS') {
  return { runId, strategyRef: 'rsi-strat', resultClass, configHash: 'h-' + runId, createdAt: '2026-01-01T00:00:00Z', metrics, gateResults: [], warnings: [] };
}

async function seedRunCard(card: ReturnType<typeof runCard>): Promise<void> {
  await mkdir(paths.runRoots[0], { recursive: true });
  await writeFile(join(paths.runRoots[0], 'run_card.json'), JSON.stringify(card));
}

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
      await seedRunCard(runCard('run-7', { sharpe: 1.0 }));
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
      await seedRunCard(runCard('run-5', { sharpe: 1.5, maxDrawdown: -0.05, winRate: 0.6, tradeCount: 42 }, 'OOS'));
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
