/**
 * Deterministic Synthetic Market Fixtures for `SYNTHETIC_ONLY_MODE=true`.
 *
 * Zero external network egress (`MARKET_DATA_ENABLED=false`, `LIVE_TRADING_ENABLED=false`).
 * All outputs are tagged `source: 'deterministic-fixture'` and must never enter
 * empirical IC evidence counters.
 */

import {
  hasConflictingSyntheticFlags,
  isSyntheticOnlyMode,
  type PolyBetaEnv,
  type PolyBetaMarketSnapshot,
} from './poly-beta-types';

export function resolveSyntheticMarketHealthOverride(
  env: PolyBetaEnv,
  nowMs: number,
): { marketDataEnabled: boolean; feedHealthy: boolean; supportedMarketCount: number; disabledReason: string | null } | null {
  if (hasConflictingSyntheticFlags(env)) {
    return { marketDataEnabled: false, feedHealthy: false, supportedMarketCount: 0, disabledReason: 'CONFLICTING_SYNTHETIC_AND_MARKET_DATA_FLAGS' };
  }
  if (isSyntheticOnlyMode(env)) {
    return { marketDataEnabled: false, feedHealthy: true, supportedMarketCount: buildSyntheticBetaMarkets(nowMs).length, disabledReason: 'SYNTHETIC_ONLY' };
  }
  return null;
}

export function resolveSyntheticMarketsOverride(
  env: PolyBetaEnv,
  nowMs: number,
): { markets: PolyBetaMarketSnapshot[]; feedHealthy: boolean; staleReason: string | null; marketDataEnabled: boolean } | null {
  if (hasConflictingSyntheticFlags(env)) {
    return { markets: [], feedHealthy: false, staleReason: 'CONFLICTING_SYNTHETIC_AND_MARKET_DATA_FLAGS', marketDataEnabled: false };
  }
  if (isSyntheticOnlyMode(env)) {
    return { markets: buildSyntheticBetaMarkets(nowMs), feedHealthy: true, staleReason: null, marketDataEnabled: false };
  }
  return null;
}

export function buildSyntheticBetaMarkets(nowMs = Date.now()): PolyBetaMarketSnapshot[] {
  const phase = Math.floor(nowMs / 10_000) % 4;
  const drift = [0, 0.01, 0, -0.01][phase] ?? 0;

  return [
    {
      marketId: 'syn-fed-rate-cut-q4',
      question: '[SYNTHETIC] Will global central bank benchmark rate fall >=25 bps next meeting?',
      slug: 'syn-fed-rate-cut-q4',
      category: 'Macro (Synthetic)',
      yesTokenId: 'syn-tok-yes-macro-01',
      noTokenId: 'syn-tok-no-macro-01',
      bestBid: Number((0.54 + drift).toFixed(2)),
      bestAsk: Number((0.56 + drift).toFixed(2)),
      midPrice: Number((0.55 + drift).toFixed(2)),
      spreadBps: 364,
      feeRateBps: 200,
      tickSize: 0.01,
      minOrderShares: 1,
      source: 'deterministic-fixture',
      sourceTimestampMs: nowMs,
      fetchedAtMs: nowMs,
    },
    {
      marketId: 'syn-ai-benchmark-2026',
      question: '[SYNTHETIC] Will open-weights model score >90% on FrontierEval by Q4?',
      slug: 'syn-ai-benchmark-2026',
      category: 'Technology (Synthetic)',
      yesTokenId: 'syn-tok-yes-tech-02',
      noTokenId: 'syn-tok-no-tech-02',
      bestBid: Number((0.61 - drift).toFixed(2)),
      bestAsk: Number((0.63 - drift).toFixed(2)),
      midPrice: Number((0.62 - drift).toFixed(2)),
      spreadBps: 323,
      feeRateBps: 200,
      tickSize: 0.01,
      minOrderShares: 1,
      source: 'deterministic-fixture',
      sourceTimestampMs: nowMs,
      fetchedAtMs: nowMs,
    },
    {
      marketId: 'syn-energy-grid-record',
      question: '[SYNTHETIC] Will EU renewable grid share exceed 55% in Q4?',
      slug: 'syn-energy-grid-record',
      category: 'Energy (Synthetic)',
      yesTokenId: 'syn-tok-yes-energy-03',
      noTokenId: 'syn-tok-no-energy-03',
      bestBid: 0.42,
      bestAsk: 0.44,
      midPrice: 0.43,
      spreadBps: 465,
      feeRateBps: 200,
      tickSize: 0.01,
      minOrderShares: 1,
      source: 'deterministic-fixture',
      sourceTimestampMs: nowMs,
      fetchedAtMs: nowMs,
    },
  ];
}
