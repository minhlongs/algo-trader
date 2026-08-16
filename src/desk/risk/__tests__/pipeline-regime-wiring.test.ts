import { describe, it, expect } from 'vitest';
import { createTradingPipeline } from '../../trading-pipeline';
import { WalletManager } from '../../wallet/wallet-manager';
import { ImmutableTradeAudit } from '../../audit/immutable-trade-audit';
import type { MarketRegime } from '../../../alpha-lab/regimes/regime-types';

function makeConfig(overrides?: { regimeEngine?: { getRegime(market: string, timeframe: string): MarketRegime } }) {
  return {
    initialPortfolioValue: 10_000,
    walletLabel: 'live',
    kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05, minPositionUsd: 1, isManagedCapital: true },
    drawdown: {},
    twap: {},
    twapThresholdUsd: 500,
    ...(overrides?.regimeEngine && { regimeEngine: overrides.regimeEngine }),
  };
}

describe('TradingPipeline regime wiring', () => {
  it('uses regime-aware sizing when regimeEngine is provided', () => {
    const regimeEngine = {
      getRegime: (_market: string, _timeframe: string): MarketRegime => 'TREND_UP',
    };

    const pipeline = createTradingPipeline(makeConfig({ regimeEngine }));

    const result = pipeline.sizePosition({
      market: 'btc',
      timeframe: '1h',
      winProbability: 0.6,
      winLossRatio: 2.0,
      portfolioValue: 10_000,
    });

    expect(result.positionSizeUsd).toBeGreaterThan(0);
  });

  it('falls back to plain Kelly when no regimeEngine', () => {
    const pipeline = createTradingPipeline(makeConfig());

    const result = pipeline.sizePosition({
      market: 'btc',
      timeframe: '1h',
      winProbability: 0.6,
      winLossRatio: 2.0,
      portfolioValue: 10_000,
    });

    expect(typeof result.positionSizeUsd).toBe('number');
  });
});