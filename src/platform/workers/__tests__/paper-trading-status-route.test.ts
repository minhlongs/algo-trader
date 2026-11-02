/**
 * Unit tests for GET /api/v1/paper-trading/status and CI/CD auto-mutation gates.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPaperTradingStatus,
  initPaperTrading,
  stopPaperTrading,
  __resetPaperTradingLoop,
} from '../paper-trading-entry';
import { handlePaperTradingStatusRoute } from '../edge-proxy-inline-routes';
import { STATE_KEY, type KVStore, type PaperTradeRecord } from '../../../desk/paper-trading/paper-trading-types';

describe('GET /api/v1/paper-trading/status & getPaperTradingStatus', () => {
  beforeEach(() => {
    stopPaperTrading();
    __resetPaperTradingLoop();
    delete process.env.PAPER_TRADING_ENABLED;
    delete process.env.QWEN_KILL;
  });

  it('returns disabled status with 0 trades and 0 mutations when PAPER_TRADING_ENABLED is not set', async () => {
    const kv: KVStore = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    };
    const res = await handlePaperTradingStatusRoute(() =>
      getPaperTradingStatus(kv, { PAPER_TRADING_ENABLED: 'false', QWEN_KILL: '0' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      enabled: boolean;
      killed: boolean;
      state: {
        running: boolean;
        openTrades: number;
        closedTrades: number;
        totalTrades: number;
        totalPnlUsd: number;
        winRate: number;
        startedAt: number | null;
        uptimeMs: number;
      };
      tradeCounter: number;
      timestamp: string;
      versionIdentity: {
        commitSha: string;
        shortSha: string;
        deployedAt: string | null;
        deployBranch: string | null;
        environment: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.enabled).toBe(false);
    expect(body.killed).toBe(false);
    expect(body.state.running).toBe(false);
    expect(body.state.openTrades).toBe(0);
    expect(body.state.closedTrades).toBe(0);
    expect(body.state.totalPnlUsd).toBe(0);
    expect(body.state.winRate).toBe(0);
    expect(body.state.startedAt).toBeNull();
    expect(body.state.uptimeMs).toBe(0);
    expect(body.tradeCounter).toBe(0);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(body.versionIdentity).toEqual({
      commitSha: 'unknown',
      shortSha: 'unknown',
      deployedAt: null,
      deployBranch: null,
      environment: 'unknown',
    });
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('reads persisted KV state (STATE_KEY) and computes open/closed trades, PnL, winRate, uptimeMs, and versionIdentity', async () => {
    const startTime = Date.now() - 15_000;
    const sampleTrades: PaperTradeRecord[] = [
      {
        id: 'pt-1',
        symbol: 'BTC/USD',
        side: 'BUY',
        sizeUsd: 100,
        entryPrice: 50_000,
        exitPrice: 51_000,
        pnlUsd: 2.0,
        openedAt: startTime,
        closedAt: startTime + 5_000,
      },
      {
        id: 'pt-2',
        symbol: 'ETH/USD',
        side: 'SELL',
        sizeUsd: 100,
        entryPrice: 3_000,
        exitPrice: 3_030,
        pnlUsd: -1.0,
        openedAt: startTime + 1_000,
        closedAt: startTime + 6_000,
      },
      {
        id: 'pt-3',
        symbol: 'BTC/USD',
        side: 'BUY',
        sizeUsd: 100,
        entryPrice: 50_500,
        openedAt: startTime + 2_000,
      },
    ];
    const kv: KVStore = {
      get: vi.fn(async (key: string) =>
        key === STATE_KEY ? { trades: sampleTrades, tradeCounter: 9, startTime } : null,
      ),
      put: vi.fn(async () => undefined),
    };

    const status = await getPaperTradingStatus(kv, {
      PAPER_TRADING_ENABLED: 'true',
      QWEN_KILL: '0',
      COMMIT_SHA: '2512e432dec281e49fefbf03e08241e538ef46c1',
      DEPLOYED_AT: '2026-11-02T01:45:27.894Z',
      DEPLOY_BRANCH: 'main',
      ENVIRONMENT: 'staging',
    });

    expect(status.ok).toBe(true);
    expect(status.enabled).toBe(true);
    expect(status.killed).toBe(false);
    expect(status.tradeCounter).toBe(9);
    expect(status.state.running).toBe(true);
    expect(status.state.openTrades).toBe(1);
    expect(status.state.closedTrades).toBe(2);
    expect(status.state.totalTrades).toBe(3);
    expect(status.state.totalPnlUsd).toBeCloseTo(1.0, 5);
    expect(status.state.winRate).toBeCloseTo(0.5, 5);
    expect(status.state.startedAt).toBe(startTime);
    expect(status.state.uptimeMs).toBeGreaterThanOrEqual(10_000);
    expect(Number.isNaN(Date.parse(status.timestamp))).toBe(false);
    expect(status.versionIdentity).toEqual({
      commitSha: '2512e432dec281e49fefbf03e08241e538ef46c1',
      shortSha: '2512e432',
      deployedAt: '2026-11-02T01:45:27.894Z',
      deployBranch: 'main',
      environment: 'staging',
    });
    expect((await handlePaperTradingStatusRoute(() => getPaperTradingStatus(kv, { PAPER_TRADING_ENABLED: 'true' }))).status).toBe(200);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('enforces L1 kill switch (QWEN_KILL=1) by reporting killed=true, running=false, uptimeMs=0 and stopping loop', async () => {
    initPaperTrading(undefined, { PAPER_TRADING_ENABLED: 'true', QWEN_KILL: '0' });
    const status = await getPaperTradingStatus(undefined, {
      PAPER_TRADING_ENABLED: 'true',
      QWEN_KILL: '1',
    });
    expect(status.ok).toBe(true);
    expect(status.enabled).toBe(true);
    expect(status.killed).toBe(true);
    expect(status.state.running).toBe(false);
    expect(status.state.uptimeMs).toBe(0);
  });

  it('returns 500 JSON response when getStatus throws unexpectedly', async () => {
    const res = await handlePaperTradingStatusRoute(async () => {
      throw new Error('kv timeout');
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Status query failed');
  });

  it('gates docker and health-check jobs and ignores markdown/plans/docs in .github/workflows/ci-cd.yml', () => {
    const wfPath = resolve(process.cwd(), '.github/workflows/ci-cd.yml');
    const wf = readFileSync(wfPath, 'utf8');
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).toContain("- 'plans/**'");
    expect(wf).toContain("- 'docs/**'");
    expect(wf).toContain("- '**.md'");
    expect(wf).toContain("if: github.event_name == 'push' && vars.DOCKER_AUTO_PUSH == 'true'");
    expect(wf).toContain("if: github.event_name == 'push' && vars.WORKER_AUTO_DEPLOY == 'true'");
  });
});
