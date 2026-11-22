/**
 * Shared Poly Beta shell fixtures: one market, one full portfolio view, and a
 * fetch mock that records calls. Test-only module — never imported by the app.
 */

import { vi } from 'vitest';
import type { BetaPortfolioView } from './poly-beta-api-client';

export const polyBetaMarket = {
  marketId: 'market-1', question: 'Will the sample resolve YES?', slug: 'sample', category: 'test',
  yesTokenId: 'yes', noTokenId: 'no', bestBid: 0.4, bestAsk: 0.5, midPrice: 0.45,
  spreadBps: 1000, feeRateBps: 0, tickSize: 0.01, minOrderShares: 5,
  source: 'fixture', sourceTimestampMs: 1_700_000_000_000, fetchedAtMs: 1_700_000_000_000,
};

export function buildPortfolio(overrides: Partial<BetaPortfolioView> = {}): BetaPortfolioView {
  return {
    ok: true, mode: 'PAPER_ONLY', liveTradingEnabled: false, tenantId: 'tenant-1',
    summary: {
      initialCapitalUsd: 100, cashBalanceUsd: 100, totalEquityUsd: 100, openExposureUsd: 0,
      realizedTradingPnlUsd: 0, unrealizedMtmPnlUsd: 0, settledRedemptionPnlUsd: 0,
      feesPaidUsd: 0, currentDrawdownPct: 0, maxDrawdownPct: 0,
    },
    limits: { maxPortfolioExposureUsd: 20, maxSingleOrderUsd: 5, maxDrawdownPct: 5 },
    engine: {
      state: 'STOPPED', haltReason: null, selectedStrategyId: 'toxicity-aware-mm-paper',
      selectedMarketId: 'market-1', lastTickAtMs: null,
    },
    health: {
      marketFeedHealthy: true, staleReason: null, ghostGuardMode: 'OFFLINE_DRILL_VERIFIED_NO_LIVE_CHAIN',
      cryptoFiveMinuteGuard: 'ENFORCED_BLOCKED', liveExecutionLock: 'LOCKED_FALSE',
      marketDataProvenance: {
        gammaApi: 'https://gamma-api.polymarket.com',
        clobApi: 'https://clob.polymarket.com/books',
        stalenessLimitMs: 30_000,
        mode: 'READ_ONLY_PUBLIC',
      },
    },
    strategies: [{
      id: 'toxicity-aware-mm-paper', name: 'Harness Taker', mode: 'PAPER_ONLY',
      summaryVi: 'Tóm tắt', summaryEn: 'Summary',
      feeModel: 'Taker fee model', queueAssumption: 'No queue',
    }],
    markets: [polyBetaMarket], openPositions: [], pendingOrders: [], orders: [],
    fills: [], ledgerEntries: [], executionLogs: [],
    ...overrides,
  };
}

export interface FetchCall {
  url: string;
  init: RequestInit;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return handler(call);
  }));
  return calls;
}
