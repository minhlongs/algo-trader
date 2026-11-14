import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HistoricalSnapshot } from '../../src/desk/backtesting/types';
import { evaluatePolymarketKpis } from '../../src/desk/cli/kpi-poly-evaluators';
import { formatKpiEvaluationReport } from '../../src/desk/cli/kpi-poly-formatter';
import { loadAllReplayedL2Steps } from '../../src/desk/cli/kpi-poly-l2-capture';
import { runObservedQuantAlphaReplay } from '../../src/desk/cli/kpi-poly-observed-replay';
import { applyIcStressShocks, buildStressModeSummary } from '../../src/desk/cli/kpi-poly-stress-shocks';
import type { KpiEvaluationInput } from '../../src/desk/cli/kpi-poly-types';
import {
  POLYMARKET_UPSTREAM_WATCHLIST,
  auditBacktestIntegrityFiles,
  diffWatchlistSnapshots,
  evaluateEodExecutionDiagnostics,
  fetchGitHubWatchlistStates,
  runRepositoryBacktestAudit,
  type RepoRemoteState,
} from '../../src/desk/governance';
import { encodePolyBookWalRecord } from '../../src/desk/polymarket/l2/poly-book-wal-codec';
import { encodePolyBookWalFrame } from '../../src/desk/polymarket/l2/poly-book-wal-crc32c';

describe('Polymarket Governance Agents (#5 CI Auditor, #6 EOD Diagnostics, #8 Watchlist) & --stress KPIs', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const d = tempDirs.pop();
      if (d) rmSync(d, { recursive: true, force: true });
    }
  });

  it('Agent #5 CI Backtest Integrity Auditor passes on real repo and flags synthetic/lookahead/prompt leaks', () => {
    const repoAudit = runRepositoryBacktestAudit(process.cwd());
    expect(repoAudit.passed).toBe(true);
    expect(repoAudit.scannedFiles).toBeGreaterThan(20);
    expect(repoAudit.findings).toHaveLength(0);

    const badCorpus = auditBacktestIntegrityFiles([
      {
        file: 'src/desk/cli/kpi-poly-rogue.ts',
        content: [
          'const step = simulateMarketRegimeTick();',
          'const cheat = peekNextSnapshot();',
          'const prompt = `Estimate yes: ${market.yesPrice}`;',
        ].join('\n'),
      },
    ]);
    expect(badCorpus.passed).toBe(false);
    expect(badCorpus.checksSummary.SYNTHETIC_FEED_IN_OBSERVED_PIPELINE).toBe('FAIL');
    expect(badCorpus.checksSummary.LOOKAHEAD_FUTURE_PEEK).toBe('FAIL');
    expect(badCorpus.checksSummary.UNSANITIZED_MARKET_ANCHOR_PROMPT).toBe('FAIL');
    expect(badCorpus.checksSummary.MISSING_FEE_SCHEDULE_ACCOUNTING).toBe('FAIL');
    expect(badCorpus.checksSummary.MISSING_FIVE_MINUTE_CRYPTO_EXCLUSION).toBe('FAIL');
  });

  it('Agent #6 EOD Execution Diagnostics classifies HEALTHY, DEGRADED, HALT_RECOMMENDED, and CRITICAL_HALT', () => {
    const baseTelemetry = {
      tradingDateIso: '2026-11-15',
      markouts: [
        { side: 'buy' as const, fillPrice: 0.48, sizeShares: 200, midAt5s: 0.485, midAt60s: 0.50, midAt300s: 0.51, makerRebateBps: 5, liquidityRewardBps: 4 },
      ],
      cancelAckLatenciesMs: [40, 65, 110, 210],
      totalCancels: 20,
      totalFills: 5,
      postOnlySubmitted: 40,
      postOnlyRejected: 4,
      restingOrdersSampled: 20,
      restingOrdersScoring: 18,
      heartbeatMisses: 0,
      http425CooldownCount: 0,
      ghostFillCount: 0,
    };
    const healthy = evaluateEodExecutionDiagnostics(baseTelemetry);
    expect(healthy.status).toBe('HEALTHY');
    expect(healthy.meanMarkout60sNetBps).toBeCloseTo(209, 4);
    expect(healthy.alerts).toHaveLength(0);

    const haltInput = {
      ...baseTelemetry,
      markouts: [{ side: 'buy' as const, fillPrice: 0.52, sizeShares: 100, midAt60s: 0.49, makerRebateBps: 2, liquidityRewardBps: 0 }],
      cancelAckLatenciesMs: [50, 1_450],
      totalCancels: 100,
      totalFills: 2,
      postOnlySubmitted: 20,
      postOnlyRejected: 10,
      restingOrdersSampled: 10,
      restingOrdersScoring: 4,
      heartbeatMisses: 1,
      http425CooldownCount: 2,
      ghostFillCount: 0,
    };
    const haltLatency = evaluateEodExecutionDiagnostics(haltInput);
    expect(haltLatency.status).toBe('HALT_RECOMMENDED');
    expect(haltLatency.alerts.length).toBeGreaterThanOrEqual(4);

    const criticalGhost = evaluateEodExecutionDiagnostics({
      ...haltInput,
      ghostFillCount: 1,
    });
    expect(criticalGhost.status).toBe('CRITICAL_HALT');
    expect(criticalGhost.alerts.some((a) => a.includes('GhostGuard'))).toBe(true);
  });

  it('Agent #8 Watchlist Monitor tracks all 10 IC repos, detects tag/SHA drift, and handles HTTP polling', async () => {
    expect(POLYMARKET_UPSTREAM_WATCHLIST).toHaveLength(10);
    const slugs = POLYMARKET_UPSTREAM_WATCHLIST.map((r) => r.slug);
    expect(slugs).toContain('weiminglong/poly-book');
    expect(slugs).toContain('OrderBookTrade/GhostGuard');
    expect(slugs).toContain('Polymarket/neg-risk-ctf-adapter');

    const base = new Map<string, RepoRemoteState>(
      POLYMARKET_UPSTREAM_WATCHLIST.map((r) => [r.slug, { slug: r.slug, latestTag: 'v1.0.0', headSha: 'aaa111', pushedAtIso: null }]),
    );
    const obs = new Map<string, RepoRemoteState>(base);
    obs.set('weiminglong/poly-book', { slug: 'weiminglong/poly-book', latestTag: 'v1.1.0', headSha: 'bbb222', pushedAtIso: null });
    obs.set('OrderBookTrade/GhostGuard', { slug: 'OrderBookTrade/GhostGuard', latestTag: 'v1.0.0', headSha: 'ccc333', pushedAtIso: null });
    obs.delete('UMAprotocol/protocol');

    const diff = diffWatchlistSnapshots(base, obs);
    expect(diff.repoCount).toBe(10);
    expect(diff.driftCount).toBe(2);
    expect(diff.unreachableCount).toBe(1);

    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      const s = String(url);
      if (s.endsWith('/releases/latest')) {
        return new Response(JSON.stringify({ tag_name: 'v2.0.0', target_commitish: 'sha200' }), { status: 200 });
      }
      return new Response(JSON.stringify({ default_branch: 'main', pushed_at: '2026-11-14T00:00:00Z' }), { status: 200 });
    }) as unknown as typeof fetch;

    const polled = await fetchGitHubWatchlistStates(POLYMARKET_UPSTREAM_WATCHLIST.slice(0, 2), fakeFetch, 1_000);
    expect(polled.get('Polymarket/clob-client')?.latestTag).toBe('v2.0.0');
  });

  it('enforces fail-closed evaluatePolyRisk preflight in runObservedQuantAlphaReplay (Defect L3)', async () => {
    const snap: HistoricalSnapshot = {
      timestamp: new Date(1_760_000_000_000).toISOString(),
      source: 'prices-history',
      markets: [{
        conditionId: 'cond-1',
        question: 'Will FOMC hold?',
        yesPrice: 0.5,
        volume: 50_000,
        liquidity: 20_000,
        endDate: '2026-12-30T00:00:00.000Z',
        closed: false,
        yesTokenId: 'tok-1',
        noTokenId: 'tok-2',
      }],
    };

    await expect(
      runObservedQuantAlphaReplay({
        snapshots: [snap],
        l2Steps: [],
        liveEvents: [],
        feeResolver: { resolve: async () => null },
        capitalUsdc: 6_000,
        tokenToCluster: new Map(),
        killSwitch: 'active',
      }),
    ).rejects.toThrow(/KILL_SWITCH_ACTIVE/);

    await expect(
      runObservedQuantAlphaReplay({
        snapshots: [snap],
        l2Steps: [],
        liveEvents: [],
        feeResolver: { resolve: async () => null },
        capitalUsdc: 6_000,
        tokenToCluster: new Map(),
        currentDrawdownPct: 4.5,
      }),
    ).rejects.toThrow(/DRAWDOWN_AUTO_HALT/);
  });

  it('loads poly-book WAL v3 segments via loadAllReplayedL2Steps and applies 1.5x / -50% reward / 4.5% carry in --stress', async () => {
    const l2Dir = mkdtempSync(join(tmpdir(), 'kpi-wal-stress-'));
    tempDirs.push(l2Dir);
    const walSub = join(l2Dir, 'wal');
    mkdirSync(walSub, { recursive: true });

    const f1 = encodePolyBookWalFrame(
      encodePolyBookWalRecord({
        tag: 'Book',
        kind: 'Snapshot',
        assetId: 'tok-wal-1',
        side: 'Bid',
        priceRaw: 4_800,
        price: '0.48',
        sizeRaw: 250_000_000n,
        size: '250',
        provenance: { recvTimestampUs: 1_760_000_000_000_000, exchangeTimestampUs: 1_760_000_000_000_000, source: 'WebSocket', sequence: 1, ingestOrdinal: 1 },
      }),
    );
    const f2 = encodePolyBookWalFrame(
      encodePolyBookWalRecord({
        tag: 'Book',
        kind: 'Snapshot',
        assetId: 'tok-wal-1',
        side: 'Ask',
        priceRaw: 5_200,
        price: '0.52',
        sizeRaw: 250_000_000n,
        size: '250',
        provenance: { recvTimestampUs: 1_760_000_000_000_000, exchangeTimestampUs: 1_760_000_000_000_000, source: 'WebSocket', sequence: 1, ingestOrdinal: 2 },
      }),
    );
    const combined = new Uint8Array(f1.length + f2.length);
    combined.set(f1, 0);
    combined.set(f2, f1.length);
    writeFileSync(join(walSub, 'segment_000001.wal'), combined);

    const steps = await loadAllReplayedL2Steps(l2Dir);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.source).toBe('poly-book-wal');
    expect(steps[0]!.bids[0]!.price).toBe('0.4800');
    expect(steps[0]!.asks[0]!.price).toBe('0.5200');

    const baseInput: KpiEvaluationInput = {
      provenance: { snapshots: [], priceRows: [], tradeRows: [], l2Steps: steps },
      performance: {
        initialNavPusd: 10_000,
        equityCurve: [
          { timestamp: '2026-11-01T00:00:00.000Z', equity: 10_000 },
          { timestamp: '2026-11-10T00:00:00.000Z', equity: 10_120 },
        ],
        closedCycles: [
          { eventClusterId: 'c1', netPnlPusd: 120, feeAndSlippagePusd: 30, notionalPusd: 4_000 },
        ],
        relayerAndApiCostPusd: 0,
        lockedCapitalAvgPusd: 2_000,
        observationSpanDays: 10,
        paperShadowDays: 10,
        mode: 'sim-90d',
        strategyClass: 'market-making',
        nTrials: 3,
        periodsPerYear: 365,
      },
      execution: {
        simMakerFillRate: 0.60,
        liveMakerFillRate: null,
        basketAttempts: 5,
        completeBaskets: 5,
        postOnlySubmitted: 20,
        postOnlyRejected: 1,
      },
      adverseSelection: {
        markouts: [
          { side: 'buy', fillPrice: 0.50, midAt60s: 0.49, makerRebateBps: 10, liquidityRewardBps: 20 },
        ],
      },
      calibration: { forecasts: [] },
      capital: { weightedAvgLockupDays: 14, awaitingResolutionPct: 10, lockedOver30dPct: 0 },
      stress: { baselineNetPnlPusd: 120, stressed15xNetPnlPusd: 105, plusHalfCentSlippageNetPnlPusd: 100 },
      capacity: { deployableCapacityPusd: 30_000 },
      tailAndSettlement: {
        eventClusterLossPctNav: [0.5],
        undetectedGhostFills: 0,
        maxUnexplainedTokenDiscrepancy: 0,
        onChainReconciled: true,
      },
    };

    const stressed = applyIcStressShocks(baseInput);
    expect(stressed.execution.simMakerFillRate).toBeCloseTo(0.40, 6);
    expect(stressed.adverseSelection.markouts[0]!.liquidityRewardBps).toBeCloseTo(10, 6);
    expect(stressed.adverseSelection.markouts[0]!.midAt60s).toBeCloseTo(0.485, 6);
    expect(stressed.performance.closedCycles[0]!.netPnlPusd).toBeLessThan(105);

    const report = {
      ...evaluatePolymarketKpis(stressed),
      stressMode: buildStressModeSummary(true),
    };
    const formatted = formatKpiEvaluationReport(report);
    expect(formatted).toContain('[STRESS: 1.5x cost/latency, -50% reward, 4.5%/yr carry]');
    expect(formatted).toContain('poly-book-wal');
  });
});
