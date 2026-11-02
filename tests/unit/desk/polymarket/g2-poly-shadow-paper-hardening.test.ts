/**
 * Gate G2 (`G2-Poly-Shadow`) Paper Runtime Hardening Tests (`D1`–`D6`)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveTradingOrchestrator } from '../../../../src/desk/polymarket/live-trading-orchestrator';
import { StrategyLiveBridge } from '../../../../src/desk/polymarket/strategy-live-bridge';
import { LiveOrderManagerProxy } from '../../../../src/desk/polymarket/live-order-manager-proxy';
import { StrategyRunner } from '../../../../src/desk/polymarket/strategy-runner';
import { PolymarketArbStrategy } from '../../../../src/desk/strategies/polymarket-arb-strategy';
import { SpreadMeanReversionStrategy, DEFAULT_CONFIG } from '../../../../src/desk/strategies/polymarket/spread-mean-reversion-v2';
import { tradingEventBus } from '../../../../src/desk/events/trading-event-bus';
import { loadG2ShadowTelemetry } from '../../../../src/desk/polymarket/g2-shadow-telemetry';
import { cleanJournalFiles } from '../../../../src/desk/polymarket/__tests__/strategy-runner-fixtures';
import type { GammaMarket } from '../../../../src/desk/polymarket/gamma-client';

function makeArbMarket(): GammaMarket {
  return {
    id: 'm-g2-hardening', question: 'Will BTC exceed 150k in 2027?', slug: 'btc-150k-2027',
    conditionId: 'cond-g2-hardening', outcomes: ['Yes', 'No'], outcomePrices: ['0.45', '0.46'],
    volume: 250_000, liquidity: 60_000, endDate: '2027-12-31', active: true, closed: false, resolved: false,
    tokens: [
      { token_id: 'tok-yes-h', outcome: 'Yes', price: 0.45 },
      { token_id: 'tok-no-h', outcome: 'No', price: 0.46 },
    ],
    yesTokenId: 'tok-yes-h', noTokenId: 'tok-no-h', yesPrice: 0.45,
  };
}

const emptyGamma = {
  getTrending: vi.fn(async () => []), getMarkets: vi.fn(async () => []),
  getMarket: vi.fn(async () => null), getMarketGroup: vi.fn(async () => null),
  searchMarkets: vi.fn(async () => []), getEvents: vi.fn(async () => []),
};

describe('G2-Poly-Shadow Paper Runtime Hardening (D1-D5)', () => {
  beforeEach(() => cleanJournalFiles());
  afterEach(() => cleanJournalFiles());

  it('D1: enforces minExecutionIntervalMs debounce, maxTicks auto-stop, and routes ticks through orchestrator.executeStrategyTick', async () => {
    const runner = new StrategyRunner(SpreadMeanReversionStrategy, {
      strategyConfig: { ...DEFAULT_CONFIG, maxPositions: 2 },
      tradingConfig: { paperTrading: true, capitalUsdc: 3000 },
      minExecutionIntervalMs: 500, maxTicks: 2, deps: { gamma: emptyGamma },
    });

    await runner.start();
    const execTickSpy = vi.spyOn(runner.getOrchestrator(), 'executeStrategyTick');

    tradingEventBus.emit('PRICE_UPDATE', { tokenId: 'tok-1', bid: 0.48, ask: 0.50, timestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 30));
    expect(runner.getStatus().tickCount).toBe(1);
    expect(execTickSpy).toHaveBeenCalledTimes(1);

    tradingEventBus.emit('PRICE_UPDATE', { tokenId: 'tok-1', bid: 0.48, ask: 0.50, timestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 30));
    expect(runner.getStatus().tickCount).toBe(1);
    expect(execTickSpy).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 520));
    tradingEventBus.emit('PRICE_UPDATE', { tokenId: 'tok-1', bid: 0.49, ask: 0.51, timestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 40));

    expect(runner.getStatus().tickCount).toBe(2);
    expect(execTickSpy).toHaveBeenCalledTimes(2);
    expect(runner.getStatus().status).toBe('stopped');
  });

  it('D2 & D3: sweeps CLOB orderbook levels (FILLED, PARTIALLY_FILLED VWAP, REJECTED/unmatched) and keeps PositionTracker + Reconciler + Journal in sync', async () => {
    const orch = new LiveTradingOrchestrator({ capitalUsdc: 5000, paperTrading: true, maxPositionFraction: 0.5 });
    await orch.start();

    orch.setPaperOrderBookProvider(async (tokenId: string) => {
      if (tokenId === 'tok-partial') {
        return {
          bids: [{ price: '0.48', size: '100' }],
          asks: [{ price: '0.50', size: '20' }, { price: '0.52', size: '20' }, { price: '0.60', size: '100' }],
        };
      }
      if (tokenId === 'tok-empty') return { bids: [], asks: [{ price: '0.80', size: '50' }] };
      return { bids: [{ price: '0.49', size: '200' }], asks: [{ price: '0.50', size: '200' }] };
    });

    const bridge = new StrategyLiveBridge(orch);
    const proxy = new LiveOrderManagerProxy(bridge, 'polymarket-arb');

    const partialRes = await proxy.placeOrder({ tokenId: 'tok-partial', side: 'buy', price: '0.55', size: '60' });
    expect(partialRes.filled).toBe(true);
    expect(Number(partialRes.filledSize)).toBeCloseTo(40, 6);
    expect(Number(partialRes.fillPrice)).toBeCloseTo(0.51, 6);
    expect(orch.getReconciler().getOrder(partialRes.id)?.status).toBe('PARTIALLY_FILLED');

    const rejectRes = await proxy.placeOrder({ tokenId: 'tok-empty', side: 'buy', price: '0.50', size: '30' });
    expect(rejectRes.filled).toBe(false);
    expect(rejectRes.filledSize).toBe('0');
    expect(orch.getReconciler().getOrder(rejectRes.id)?.status).toBe('REJECTED');

    const posSummary = orch.getPositionSummary();
    const recSummary = orch.getReconciliationSummary();
    const journalFills = await orch.getJournal().loadFills();

    expect(posSummary.positionCount).toBe(1);
    expect(posSummary.totalExposure).toBeCloseTo(40 * 0.51, 6);
    expect(recSummary.positionsByToken['tok-partial']).toBeCloseTo(40, 6);
    expect(recSummary.unexplainedDriftUsdc).toBe(0);
    expect(journalFills.length).toBe(1);
    expect(journalFills[0]?.size).toBeCloseTo(40, 6);
    expect(journalFills[0]?.price).toBeCloseTo(0.51, 6);

    await orch.stop();
  });

  it('D2: triggers Leg-1 compensatory unwind in PolymarketArbStrategy when Leg-2 orderbook liquidity evaporates and tracks leg2FillDecayRatio', async () => {
    let noBookCalls = 0;
    const mockClob = {
      getOrderBook: vi.fn(async (tokenId: string) => {
        if (tokenId === 'tok-yes-h') {
          return { bids: [{ price: '0.45', size: '500' }], asks: [{ price: '0.45', size: '500' }], timestamp: Date.now() };
        }
        noBookCalls++;
        const askPrice = noBookCalls === 1 ? '0.46' : '0.99';
        return { bids: [{ price: '0.45', size: '500' }], asks: [{ price: askPrice, size: '500' }], timestamp: Date.now() };
      }),
      getPrice: vi.fn(async () => 0.45), getMidPrice: vi.fn(async () => 0.45),
    };
    const mockGamma = {
      ...emptyGamma,
      getTrending: vi.fn(async () => [makeArbMarket()]),
      getMarkets: vi.fn(async () => [makeArbMarket()]),
      getMarket: vi.fn(async () => makeArbMarket()),
    };

    const runner = new StrategyRunner(PolymarketArbStrategy, {
      strategyConfig: {
        minSpread: 0.02, spreadLookback: 1, maxLegSize: 25, maxCombinedPrice: 0.98, minVolume: 1000,
        takeProfitPct: 0.025, stopLossPct: 0.02, maxHoldMs: 600_000, maxPositions: 3, cooldownMs: 60_000, positionSize: '25',
      } as never,
      tradingConfig: { paperTrading: true, capitalUsdc: 5000, maxPositionFraction: 0.5 },
      minExecutionIntervalMs: 0, deps: { clob: mockClob, gamma: mockGamma },
    });

    await runner.start();
    tradingEventBus.emit('PRICE_UPDATE', { tokenId: 'tok-yes-h', bid: 0.44, ask: 0.45, timestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 60));

    expect(runner.getStatus().proxyStats.ordersPlaced).toBe(3);
    const decayStats = runner.getOrchestrator().getLeg2DecayStats();
    expect(decayStats.leg1Fills).toBe(1);
    expect(decayStats.leg2Attempts).toBe(1);
    expect(decayStats.leg2Rejects).toBe(1);
    expect(decayStats.leg2FillDecayRatio).toBe(1);

    expect(runner.getPositionSummary().positionCount).toBe(0);
    expect(runner.getReconciliationSummary().positionsByToken['tok-yes-h']).toBe(0);
    expect(runner.getReconciliationSummary().unexplainedDriftUsdc).toBe(0);

    await runner.stop();
  });

  it('D4 & D5: persists startedAtMs (T0_G2) + reconciler state across < 15m restart and writes valid JSONL telemetry identity envelopes', async () => {
    const orch1 = new LiveTradingOrchestrator({ capitalUsdc: 4000, paperTrading: true, maxPositionFraction: 0.5 });
    await orch1.start();
    const t0 = orch1.getStartedAtMs();
    expect(t0).toBeGreaterThan(0);

    const bridge1 = new StrategyLiveBridge(orch1);
    const proxy1 = new LiveOrderManagerProxy(bridge1, 'polymarket-arb');
    await proxy1.placeOrder({ tokenId: 'tok-persist-1', side: 'buy', price: '0.50', size: '40' });

    const beforeStopRec = orch1.getReconciliationSummary();
    await orch1.stop();

    const orch2 = new LiveTradingOrchestrator({ capitalUsdc: 4000, paperTrading: true, maxPositionFraction: 0.5 });
    await orch2.start();

    expect(orch2.getStartedAtMs()).toBe(t0);
    const afterRestartRec = orch2.getReconciliationSummary();
    expect(afterRestartRec.cashUsdc).toBeCloseTo(beforeStopRec.cashUsdc, 6);
    expect(afterRestartRec.totalFeesUsdc).toBeCloseTo(beforeStopRec.totalFeesUsdc, 6);
    expect(afterRestartRec.positionsByToken['tok-persist-1']).toBe(40);
    expect(afterRestartRec.unexplainedDriftUsdc).toBe(0);
    expect(orch2.getPositionSummary().positionCount).toBe(1);

    await orch2.stop();

    const telemetry = await loadG2ShadowTelemetry();
    expect(telemetry.length).toBeGreaterThanOrEqual(3);
    for (const entry of telemetry) {
      expect(typeof entry.observedAtIso).toBe('string');
      expect(entry.observedAtMs).toBeGreaterThan(0);
      expect(entry.sourceCommitSha.length).toBeGreaterThanOrEqual(7);
      expect(entry.srcTreeHash.length).toBeGreaterThanOrEqual(7);
      expect(entry.loopStartedAtMs).toBe(t0);
      expect(entry.reconciliationSummary.unexplainedDriftUsdc).toBe(0);
    }
  });
});
