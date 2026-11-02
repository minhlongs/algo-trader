/**
 * Gate G2 (`G2-Poly-Shadow`) Paper Runtime Wiring Tests
 *
 * Verifies that:
 * 1. `LiveTradingOrchestrator` wires `PolymarketOrderReconciler` in production code,
 *    records PAPER order lifecycle (`CREATED -> SUBMITTED -> ACKNOWLEDGED -> FILLED`)
 *    and `CANCELLED` transitions, and exposes `getReconciler()` + `getReconciliationSummary()`
 *    with `unexplainedDriftUsdc === 0`.
 * 2. `LiveOrderManagerProxy.placeOrder` populates `filled: true`, `filledSize`, `fillPrice`,
 *    and dynamic taker `fees` when `response.status === 'matched'`.
 * 3. `createRunnerStrategyDeps` wires non-null `clob` and `gamma` defaults and accepts
 *    dependency overrides via `StrategyRunnerConfig.deps` so `StrategyRunner` can run
 *    `PolymarketArbStrategy` end-to-end in `PAPER` mode with zero reconciler drift.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveTradingOrchestrator } from '../../../../src/desk/polymarket/live-trading-orchestrator';
import { StrategyLiveBridge } from '../../../../src/desk/polymarket/strategy-live-bridge';
import { LiveOrderManagerProxy } from '../../../../src/desk/polymarket/live-order-manager-proxy';
import { StrategyRunner, createRunnerStrategyDeps } from '../../../../src/desk/polymarket/strategy-runner';
import { PolymarketArbStrategy } from '../../../../src/desk/strategies/polymarket-arb-strategy';
import { tradingEventBus } from '../../../../src/desk/events/trading-event-bus';
import { cleanJournalFiles } from '../../../../src/desk/polymarket/__tests__/strategy-runner-fixtures';
import type { GammaMarket } from '../../../../src/desk/polymarket/gamma-client';

function makeArbMarket(): GammaMarket {
  return {
    id: 'm-g2-1',
    question: 'Will ETH exceed 5000 by Q4?',
    slug: 'eth-5000-q4',
    conditionId: 'cond-g2-shadow-1',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.47', '0.48'],
    volume: 100_000,
    liquidity: 25_000,
    endDate: '2027-12-31',
    active: true,
    closed: false,
    resolved: false,
    tokens: [
      { token_id: 'tok-yes-g2', outcome: 'Yes', price: 0.47 },
      { token_id: 'tok-no-g2', outcome: 'No', price: 0.48 },
    ],
    yesTokenId: 'tok-yes-g2',
    noTokenId: 'tok-no-g2',
    yesPrice: 0.47,
  };
}

describe('G2-Poly-Shadow Runtime Wiring', () => {
  beforeEach(() => {
    cleanJournalFiles();
  });

  afterEach(() => {
    cleanJournalFiles();
  });

  it('wires non-null clob and gamma defaults in createRunnerStrategyDeps', () => {
    const orch = new LiveTradingOrchestrator({ capitalUsdc: 1000, paperTrading: true });
    const bridge = new StrategyLiveBridge(orch);
    const proxy = new LiveOrderManagerProxy(bridge, 'polymarket-arb');

    const deps = createRunnerStrategyDeps(proxy);
    expect(deps.clob).not.toBeNull();
    expect(typeof deps.clob.getOrderBook).toBe('function');
    expect(deps.gamma).not.toBeNull();
    expect(typeof deps.gamma.getTrending).toBe('function');
  });

  it('records PAPER orders and cancellations in LiveTradingOrchestrator.getReconciliationSummary() with zero drift', async () => {
    const orch = new LiveTradingOrchestrator({ capitalUsdc: 2000, paperTrading: true });
    await orch.start();

    const bridge = new StrategyLiveBridge(orch);
    const proxy = new LiveOrderManagerProxy(bridge, 'polymarket-arb');

    const res = await proxy.placeOrder({
      tokenId: 'tok-yes-g2',
      side: 'buy',
      price: '0.47',
      size: '50',
      orderType: 'GTC',
    });

    expect(res.id).toMatch(/^paper-/);
    expect(res.filled).toBe(true);
    expect(res.filledSize).toBe('50');
    expect(res.fillPrice).toBe('0.47');
    expect(Number(res.fees)).toBeGreaterThan(0);

    const summary = orch.getReconciliationSummary();
    expect(summary.initialCashUsdc).toBe(2000);
    expect(summary.unexplainedDriftUsdc).toBe(0);
    expect(summary.unknownOrderCount).toBe(0);
    expect(summary.positionsByToken['tok-yes-g2']).toBe(50);
    expect(summary.totalFeesUsdc).toBeGreaterThan(0);

    await orch.cancelOrder(res.id);
    expect(orch.getReconciler().getOrder(res.id)?.status).toBe('CANCELLED');

    await orch.stop();
  });

  it('executes PolymarketArbStrategy end-to-end via StrategyRunner in PAPER mode with zero reconciler drift', async () => {
    const mockClob = {
      getOrderBook: vi.fn(async (tokenId: string) => ({
        bids: [{ price: tokenId === 'tok-yes-g2' ? '0.46' : '0.47', size: '500' }],
        asks: [{ price: tokenId === 'tok-yes-g2' ? '0.47' : '0.48', size: '500' }],
        timestamp: Date.now(),
      })),
      getPrice: vi.fn(async () => 0.47),
      getMidPrice: vi.fn(async () => 0.465),
    };
    const mockGamma = {
      getTrending: vi.fn(async () => [makeArbMarket()]),
      getMarkets: vi.fn(async () => [makeArbMarket()]),
      getMarket: vi.fn(async () => makeArbMarket()),
      getMarketGroup: vi.fn(async () => null),
      searchMarkets: vi.fn(async () => [makeArbMarket()]),
      getEvents: vi.fn(async () => []),
    };

    const runner = new StrategyRunner(PolymarketArbStrategy, {
      strategyConfig: {
        minSpread: 0.02,
        spreadLookback: 1,
        maxLegSize: 25,
        maxCombinedPrice: 0.98,
        minVolume: 1000,
        takeProfitPct: 0.025,
        stopLossPct: 0.02,
        maxHoldMs: 600_000,
        maxPositions: 3,
        cooldownMs: 60_000,
        positionSize: '25',
      } as never,
      tradingConfig: { paperTrading: true, capitalUsdc: 5000, maxPositionFraction: 0.5 },
      minExecutionIntervalMs: 0,
      deps: { clob: mockClob, gamma: mockGamma },
    });

    await runner.start();
    tradingEventBus.emit('PRICE_UPDATE', {
      tokenId: 'tok-yes-g2',
      bid: 0.46,
      ask: 0.47,
      timestamp: Date.now(),
    });

    // Wait for async strategy tick completion
    await new Promise((r) => setTimeout(r, 50));

    const status = runner.getStatus();
    expect(status.tickCount).toBe(1);
    expect(status.proxyStats.ordersPlaced).toBe(2);

    const recon = runner.getOrchestrator().getReconciliationSummary();
    expect(recon.unexplainedDriftUsdc).toBe(0);
    expect(recon.unknownOrderCount).toBe(0);
    expect(recon.positionsByToken['tok-yes-g2']).toBeGreaterThan(0);
    expect(recon.positionsByToken['tok-no-g2']).toBeGreaterThan(0);
    expect(recon.totalFeesUsdc).toBeGreaterThan(0);

    await runner.stop();
  });
});
