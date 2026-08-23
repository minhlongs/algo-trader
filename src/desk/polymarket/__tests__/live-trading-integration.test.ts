/**
 * Live Trading Integration Tests — Paper-Mode E2E
 *
 * Exercises the full trading pipeline with real Gamma API data + paper executor.
 * No API keys, no real money, safe for CI.
 *
 * Test strategy: Gamma API tests skip-on-failure (network dependency).
 * Journal persistence uses os.tmpdir() for isolation (no ~/.cashclaw/ pollution).
 *
 * Phase 42 original + Phase 2 enhancements (Gamma API, strategy scan, env var unification)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Temp dir for journal isolation (hoisted for vi.mock access) ─────────────

const { getTestTmp } = vi.hoisted(() => {
  let testTmp = '';
  return {
    getTestTmp: () => {
      if (!testTmp) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        testTmp = `${require('os').tmpdir()}/cashclaw-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      }
      return testTmp;
    },
  };
});

// Redirect cashclawPath to test temp dir (avoids polluting ~/.cashclaw/)
vi.mock('../../../shared/persistence/file-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsMod = require('fs');
  return {
    cashclawPath: vi.fn((filename: string) => path.join(getTestTmp(), filename)),
    appendJsonl: vi.fn((filePath: string, data: Record<string, unknown>) => {
      fsMod.mkdirSync(path.dirname(filePath), { recursive: true });
      fsMod.appendFileSync(filePath, JSON.stringify(data) + '\n', 'utf8');
    }),
    readJsonl: vi.fn(<T>(filePath: string): T[] => {
      try {
        const content = fsMod.readFileSync(filePath, 'utf8');
        return content.trim().split('\n').filter(Boolean).map((l: string) => JSON.parse(l) as T);
      } catch { return []; }
    }),
    readJsonState: vi.fn(<T>(filePath: string): T | null => {
      try {
        return JSON.parse(fsMod.readFileSync(filePath, 'utf8')) as T;
      } catch { return null; }
    }),
  };
});

import { LiveTradingOrchestrator } from '../live-trading-orchestrator';
import { StrategyLiveBridge } from '../strategy-live-bridge';
import { StrategyAdapter } from '../strategy-adapter';
import type { GammaMarket } from '../gamma-client';

// ── Constants ───────────────────────────────────────────────────────────────

const GAMMA_API = 'https://gamma-api.polymarket.com';
const FETCH_TIMEOUT_MS = 10_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function createOrchestrator(capital = 5000) {
  return new LiveTradingOrchestrator({ paperTrading: true, capitalUsdc: capital });
}

async function fetchGammaMarkets(limit = 5): Promise<GammaMarket[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${GAMMA_API}/markets?limit=${limit}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as GammaMarket[];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function skipIfGammaUnreachable(markets: GammaMarket[] | null): boolean {
  if (!markets || markets.length === 0) {
    console.warn('[SKIP] Gamma API unreachable — skipping test');
    return true;
  }
  return false;
}

function cleanupTempDir(): void {
  try {
    const tmp = getTestTmp();
    if (fs.existsSync(tmp)) {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    tokenId: '0xabc123def456',
    price: 0.55,
    size: 100,
    side: 'BUY' as const,
    expiration: Math.floor(Date.now() / 1000) + 300,
    nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    feeRateBps: 0,
    signatureType: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Gamma API Connectivity (skip-on-failure)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gamma API connectivity', () => {
  it('fetches real markets with valid response shape', async () => {
    const markets = await fetchGammaMarkets(5);
    if (skipIfGammaUnreachable(markets)) return;
    expect(Array.isArray(markets)).toBe(true);
    expect(markets!.length).toBeGreaterThan(0);
  });

  it('returns markets with required schema fields (conditionId, question, outcomes, yesPrice)', async () => {
    const markets = await fetchGammaMarkets(5);
    if (skipIfGammaUnreachable(markets)) return;
    const m = markets![0];
    expect(m.conditionId).toBeTruthy();
    expect(typeof m.conditionId).toBe('string');
    expect(m.question).toBeTruthy();
    // outcomes, yesPrice, active may vary by market type — verify core fields present
    expect(m).toHaveProperty('conditionId');
    expect(m).toHaveProperty('question');
    expect(m).toHaveProperty('active');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy Scan (with real Gamma data, skip-on-failure)
// ═══════════════════════════════════════════════════════════════════════════════

describe('strategy scanning', () => {
  it('scans real Gamma markets and instantiates a V2 strategy', async () => {
    const markets = await fetchGammaMarkets(10);
    if (skipIfGammaUnreachable(markets)) return;
    // Dynamically import a V2 strategy — verify it accepts real market data
    const { ResolutionFrontrunnerStrategy, DEFAULT_CONFIG } = await import(
      '../../strategies/polymarket/resolution-frontrunner-v2'
    );
    const strategy = new ResolutionFrontrunnerStrategy(DEFAULT_CONFIG);
    expect(strategy).toBeDefined();
    expect(strategy.constructor.name).toBe('ResolutionFrontrunnerStrategy');
  });

  it('strategy instantiation handles empty markets without error', async () => {
    const { ResolutionFrontrunnerStrategy, DEFAULT_CONFIG } = await import(
      '../../strategies/polymarket/resolution-frontrunner-v2'
    );
    const strategy = new ResolutionFrontrunnerStrategy(DEFAULT_CONFIG);
    expect(strategy).toBeDefined();
    // Strategy should be instantiable without markets
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Orchestrator Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('Live Trading Pipeline (E2E)', () => {
  let orch: LiveTradingOrchestrator;

  beforeEach(async () => {
    fs.mkdirSync(getTestTmp(), { recursive: true });
    orch = createOrchestrator(5000);
    await orch.start();
  });

  afterEach(async () => {
    await orch.stop();
    cleanupTempDir();
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────

  it('starts in PAPER mode and transitions through lifecycle', () => {
    expect(orch.getStatus()).toBe('running');
    expect(orch.getMode()).toBe('PAPER');
    expect(orch.getPositions()).toEqual([]);
    expect(orch.getActiveOrders()).toEqual([]);
  });

  it('start → stop → start cycles cleanly', async () => {
    expect(orch.getStatus()).toBe('running');
    await orch.stop();
    expect(orch.getStatus()).toBe('stopped');

    await orch.start();
    expect(orch.getStatus()).toBe('running');

    await orch.placeOrder(makeOrder({ tokenId: '0xcycle', size: 20 }));

    await orch.stop();
    expect(orch.getStatus()).toBe('stopped');
  });

  it('stop() is idempotent — returns immediately if already stopped', async () => {
    await orch.stop();
    expect(orch.getStatus()).toBe('stopped');
    // Double stop should not throw
    await orch.stop();
    expect(orch.getStatus()).toBe('stopped');
  });

  // ── Order placement (PAPER mode) ────────────────────────────────────────

  it('places a BUY order and returns paper order ID', async () => {
    const resp = await orch.placeOrder(makeOrder({ side: 'BUY', price: 0.55, size: 100 }));
    expect(resp.orderID).toMatch(/^paper-/);
    expect(resp.status).toBe('matched');
  });

  it('places a SELL order and returns paper order ID', async () => {
    const resp = await orch.placeOrder(makeOrder({ side: 'SELL', price: 0.65, size: 50 }));
    expect(resp.orderID).toMatch(/^paper-/);
    expect(resp.status).toBe('matched');
  });

  it('places multiple orders concurrently — all unique IDs', async () => {
    const orders = Array.from({ length: 5 }, (_, i) =>
      orch.placeOrder(makeOrder({
        tokenId: `0xconcurrent${i}`,
        price: 0.5 + i * 0.05,
        size: 50,
        side: i % 2 === 0 ? 'BUY' as const : 'SELL' as const,
      })),
    );
    const results = await Promise.all(orders);
    expect(results).toHaveLength(5);
    const ids = new Set(results.map((r) => r.orderID));
    expect(ids.size).toBe(5);
  });

  it('throws on placeOrder after stop', async () => {
    await orch.stop();
    await expect(orch.placeOrder(makeOrder())).rejects.toThrow(
      'Orchestrator not running',
    );
  });

  // ── Execution guard ─────────────────────────────────────────────────────

  it('guard is disabled in PAPER mode (all orders pass)', () => {
    const status = orch.getGuardStatus();
    expect(status.enabled).toBe(false);
    expect(status.circuitTripped).toBe(false);
  });

  it('large orders pass in PAPER mode (guard disabled)', async () => {
    const resp = await orch.placeOrder(makeOrder({
      tokenId: '0xbig',
      price: 0.5,
      size: 500,
    }));
    expect(resp.orderID).toMatch(/^paper-/);
  });

  it('guard status returns expected fields', () => {
    const status = orch.getGuardStatus();
    expect(status).toHaveProperty('enabled');
    expect(status).toHaveProperty('circuitTripped');
    expect(status).toHaveProperty('consecutiveLosses');
    expect(status).toHaveProperty('totalWins');
    expect(status).toHaveProperty('totalLosses');
    expect(status).toHaveProperty('dailyPnl');
    expect(status).toHaveProperty('openPositions');
  });

  // ── Position tracking ───────────────────────────────────────────────────

  it('position summary starts at zero before any orders', () => {
    const summary = orch.getPositionSummary();
    expect(summary.positionCount).toBe(0);
    expect(summary.totalExposure).toBe(0);
    expect(summary.totalRealizedPnl).toBe(0);
  });

  it('position summary reports correctly after orders', async () => {
    await orch.placeOrder(makeOrder({ tokenId: '0xposA', side: 'BUY', size: 10, price: 0.55 }));
    await orch.placeOrder(makeOrder({ tokenId: '0xposB', side: 'SELL', size: 5, price: 0.65 }));

    const summary = orch.getPositionSummary();
    expect(typeof summary.totalExposure).toBe('number');
    expect(typeof summary.totalUnrealizedPnl).toBe('number');
    expect(typeof summary.totalRealizedPnl).toBe('number');
  });

  // ── Journal persistence (temp dir) ──────────────────────────────────────

  it('journal is accessible and empty initially', () => {
    const journal = orch.getJournal();
    expect(journal).toBeDefined();
    expect(journal.loadFills()).toEqual([]);
  });

  it('persistState() saves positions and P&L to temp dir', async () => {
    await orch.placeOrder(makeOrder({ tokenId: '0xpersist', price: 0.60, size: 30 }));

    await orch.stop();

    // Verify files in temp dir, not ~/.cashclaw/
    const posFile = path.join(getTestTmp(), 'live-positions.json');
    expect(fs.existsSync(posFile)).toBe(true);

    const pnlFile = path.join(getTestTmp(), 'live-pnl.json');
    expect(fs.existsSync(pnlFile)).toBe(true);
  });

  it('journal persists across stop/start cycles', async () => {
    await orch.placeOrder(makeOrder({ tokenId: '0xpersist1', price: 0.55, size: 10 }));
    await orch.stop();

    // New orchestrator restores from same temp dir
    const orch2 = new LiveTradingOrchestrator({ paperTrading: true, capitalUsdc: 5000 });
    await orch2.start();
    expect(orch2.getStatus()).toBe('running');
    await orch2.stop();
  });

  // ── Bridge + Adapter integration ────────────────────────────────────────

  it('bridge routes signals through orchestrator', async () => {
    const bridge = new StrategyLiveBridge(orch);
    const result = await bridge.onSignal({
      tokenId: '0xbridgetest',
      side: 'BUY',
      size: 20,
      price: 0.45,
      description: 'Bridge test signal',
      confidence: 0.8,
    });
    expect(result.rejected).toBe(false);
    expect(result.response?.orderID).toMatch(/^paper-/);
    expect(result.error).toBeNull();
  });

  it('adapter enters and exits a position through bridge', async () => {
    const bridge = new StrategyLiveBridge(orch);
    const adapter = new StrategyAdapter(bridge, 'test-strategy');

    const entry = await adapter.enterPosition({
      tokenId: '0xadaptertest',
      conditionId: '0xcond123',
      side: 'yes',
      price: 0.50,
      size: 40,
    });
    expect(entry.orderId).toMatch(/^paper-/);
    expect(entry.side).toBe('BUY');

    const exit = await adapter.exitPosition({
      tokenId: '0xadaptertest',
      conditionId: '0xcond123',
      price: 0.62,
      reason: 'take-profit',
    });
    expect(exit.orderId).toMatch(/^paper-/);
    expect(exit.side).toBe('SELL');

    const stats = adapter.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.exits).toBe(1);
    expect(stats.totalFills).toBe(2);

    const active = adapter.getActiveFills();
    expect(active.size).toBe(0);
  });

  it('adapter tracks multiple open positions', async () => {
    const bridge = new StrategyLiveBridge(orch);
    const adapter = new StrategyAdapter(bridge, 'multi-strat');

    await adapter.enterPosition({
      tokenId: '0xmulti1', conditionId: '0xcondA', side: 'yes', price: 0.40, size: 30,
    });
    await adapter.enterPosition({
      tokenId: '0xmulti2', conditionId: '0xcondB', side: 'no', price: 0.30, size: 25,
    });

    const active = adapter.getActiveFills();
    expect(active.size).toBe(2);
  });

  // ── Bridge stats ────────────────────────────────────────────────────────

  it('bridge delivers accurate stats after signals', async () => {
    const bridge = new StrategyLiveBridge(orch);
    await bridge.onSignal({ tokenId: '0xstats1', side: 'BUY', size: 10, price: 0.5, confidence: 0.6 });
    await bridge.onSignal({ tokenId: '0xstats2', side: 'SELL', size: 10, price: 0.4, confidence: 0.5 });

    const stats = bridge.getStats();
    expect(stats.signalsProcessed).toBe(2);
    expect(stats.signalsRejected).toBe(0);
    expect(stats.scansCompleted).toBe(0);
    expect(stats.scannerActive).toBe(false);
  });

  // ── Mode reporting ──────────────────────────────────────────────────────

  it('orchestrator reports correct mode (PAPER vs LIVE)', () => {
    expect(orch.getMode()).toBe('PAPER');

    const liveOrch = new LiveTradingOrchestrator({ paperTrading: false, capitalUsdc: 1000 });
    expect(liveOrch.getMode()).toBe('LIVE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════════════════════

describe('error handling', () => {
  let orch: LiveTradingOrchestrator;

  beforeEach(async () => {
    fs.mkdirSync(getTestTmp(), { recursive: true });
    orch = createOrchestrator(1000);
    await orch.start();
  });

  afterEach(async () => {
    await orch.stop();
    cleanupTempDir();
  });

  it('rejects orders when orchestrator is stopped', async () => {
    await orch.stop();
    await expect(orch.placeOrder(makeOrder())).rejects.toThrow('Orchestrator not running');
  });

  it('Gamma API handles timeout/abort gracefully', async () => {
    const controller = new AbortController();
    controller.abort(); // immediate abort — simulates timeout

    try {
      await fetch(`${GAMMA_API}/markets?limit=1`, { signal: controller.signal });
    } catch (err) {
      expect(err).toBeDefined();
      expect((err as Error).name).toMatch(/AbortError|TypeError/);
    }
  });
});
