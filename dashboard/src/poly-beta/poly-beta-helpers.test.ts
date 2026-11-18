import { describe, expect, it } from 'vitest';
import type { BetaPortfolioView } from './poly-beta-api-client';
import {
  buildSettleButtonLabel,
  buildSettleDrillConfirm,
  getControlAvailability,
  getEngineBadgeClasses,
  getSellableShares,
  localizeBetaError,
} from './poly-beta-helpers';

const market = {
  marketId: 'market-1', question: 'Will the sample resolve YES?', slug: 'sample', category: 'test',
  yesTokenId: 'yes', noTokenId: 'no', bestBid: 0.4, bestAsk: 0.5, midPrice: 0.45,
  spreadBps: 1000, feeRateBps: 0, tickSize: 0.01, minOrderShares: 5,
  source: 'fixture', sourceTimestampMs: 1, fetchedAtMs: 1,
};

function view(overrides: Partial<BetaPortfolioView> = {}): BetaPortfolioView {
  return {
    ok: true, mode: 'PAPER_ONLY', liveTradingEnabled: false, tenantId: 'tenant-1',
    summary: {
      initialCapitalUsd: 100, cashBalanceUsd: 100, totalEquityUsd: 100, openExposureUsd: 0,
      realizedTradingPnlUsd: 0, unrealizedMtmPnlUsd: 0, settledRedemptionPnlUsd: 0,
      feesPaidUsd: 0, currentDrawdownPct: 0, maxDrawdownPct: 0,
    },
    limits: { maxPortfolioExposureUsd: 20, maxSingleOrderUsd: 5, maxDrawdownPct: 5 },
    engine: { state: 'STOPPED', haltReason: null, selectedStrategyId: 'toxicity-aware-mm-paper', selectedMarketId: 'market-1', lastTickAtMs: null },
    health: { marketFeedHealthy: true, staleReason: null, ghostGuardMode: 'OFF', cryptoFiveMinuteGuard: 'ENFORCED_BLOCKED', liveExecutionLock: 'LOCKED_FALSE' },
    strategies: [], markets: [market], openPositions: [], pendingOrders: [], orders: [], fills: [], ledgerEntries: [], executionLogs: [],
    ...overrides,
  };
}

describe('poly-beta UI guards and settlement copy', () => {
  it('disables trading when market feed is empty or unhealthy', () => {
    expect(getControlAvailability(view({ markets: [] }), 'market-1', 5, false).canManualTrade).toBe(false);
    expect(getControlAvailability(view({ health: { ...view().health, marketFeedHealthy: false } }), 'market-1', 5, false).canStart).toBe(false);
  });

  it('honors lifecycle, drawdown, share and busy guards', () => {
    expect(getControlAvailability(view(), 'market-1', 5, false).canStart).toBe(true);
    expect(getControlAvailability(view(), 'missing', 5, false).canStart).toBe(false);
    expect(getControlAvailability(view(), 'market-1', 21, false).canManualTrade).toBe(false);
    expect(getControlAvailability(view({ engine: { ...view().engine, state: 'HALTED' } }), 'market-1', 5, false).canManualTrade).toBe(false);
    expect(getControlAvailability(view(), 'market-1', 5, true).canStart).toBe(false);
  });

  it('gives each lifecycle state a distinct badge style', () => {
    const states = ['RUNNING', 'PAUSED', 'HALTED', 'STOPPED'] as const;
    const styles = states.map((state) => getEngineBadgeClasses(state));
    expect(new Set(styles).size).toBe(states.length);
  });

  it('labels the winner payout for the displayed position', () => {
    const pos = { marketId: 'market-1', tokenId: 'no', marketQuestion: 'Sample', outcome: 'NO' as const, shares: 7.5, avgEntryPrice: 0.4, markPrice: 0.5, unrealizedPnlUsd: 0 };
    expect(buildSettleButtonLabel(pos, 'YES', 'en')).toContain('$0.00');
    expect(buildSettleButtonLabel(pos, 'NO', 'en')).toContain('$7.50');
  });

  it('confirms settlement effects on every market position and pending order', () => {
    const state = view({
      openPositions: [
        { marketId: 'market-1', tokenId: 'yes', marketQuestion: 'Sample', outcome: 'YES', shares: 4, avgEntryPrice: 0.4, markPrice: 0.5, unrealizedPnlUsd: 0 },
        { marketId: 'market-1', tokenId: 'no', marketQuestion: 'Sample', outcome: 'NO', shares: 7, avgEntryPrice: 0.4, markPrice: 0.5, unrealizedPnlUsd: 0 },
      ],
      pendingOrders: [{ market_id: 'market-1', order_id: 'order-1' }, { market_id: 'other', order_id: 'order-2' }],
    });
    const confirmation = buildSettleDrillConfirm(state, 'market-1', 'YES', 'en');
    expect(confirmation).toContain('all 2 open position(s)');
    expect(confirmation).toContain('$4.00');
    expect(confirmation).toContain('Cancels 1 pending order');
  });

  it('localizes network failures without exposing internal error codes', () => {
    expect(localizeBetaError({ status: 0, data: { code: 'NETWORK_TIMEOUT' } }, 'vi', 'fallback')).toContain('thời gian');
  });

  it('subtracts resting SELL reservations from sellable shares', () => {
    const state = view({
      openPositions: [
        { marketId: 'market-1', tokenId: 'yes', marketQuestion: 'Sample', outcome: 'YES', shares: 10, avgEntryPrice: 0.4, markPrice: 0.5, unrealizedPnlUsd: 0 },
      ],
      pendingOrders: [
        { market_id: 'market-1', order_id: 'o1', side: 'SELL', outcome: 'YES', size_shares_micro: 4_000_000 },
        { market_id: 'market-1', order_id: 'o2', side: 'BUY', outcome: 'YES', size_shares_micro: 9_000_000 },
      ],
    });
    expect(getSellableShares(state, 'market-1', 'YES')).toBe(6);
    expect(getSellableShares(state, 'market-1', 'NO')).toBe(0);
  });
});
