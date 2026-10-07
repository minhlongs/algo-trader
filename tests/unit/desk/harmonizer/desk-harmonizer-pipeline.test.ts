import { describe, it, expect } from 'vitest';
import { DeskHarmonizerPipeline } from '../../../../src/desk/harmonizer/desk-harmonizer-pipeline';

describe('Desk Harmonizer Pipeline Suite', () => {
  it('harmonizes cross-venue lead-lag alpha and activates quoting state', () => {
    const pipeline = new DeskHarmonizerPipeline();
    const predictor = pipeline.getPredictor();

    // Feed lead/lag venue ticks
    predictor.recordTick({ venue: 'Binance', symbol: 'BTC', price: 60000, timestampMs: 1000 });
    predictor.recordTick({ venue: 'Binance', symbol: 'BTC', price: 60300, timestampMs: 2000 });
    predictor.recordTick({ venue: 'Binance', symbol: 'BTC', price: 60600, timestampMs: 3000 });

    predictor.recordTick({ venue: 'Polymarket', symbol: 'BTC', price: 0.50, timestampMs: 1050 });
    predictor.recordTick({ venue: 'Polymarket', symbol: 'BTC', price: 0.51, timestampMs: 2050 });
    predictor.recordTick({ venue: 'Polymarket', symbol: 'BTC', price: 0.52, timestampMs: 3050 });

    const decision = pipeline.executeCycle({
      marketId: 'market-btc-yes',
      leadVenue: 'Binance',
      lagVenue: 'Polymarket',
      symbol: 'BTC',
      currentMidPrice: 0.50,
      netInventory: 100,
      timeToExpirySec: 86400 * 7,
      timestampMs: 3100,
    });

    expect(decision.state).toBe('QUOTING_ACTIVE');
    expect(decision.quotes).toBeDefined();
    expect(decision.quotes?.bidPrice).toBeLessThan(0.50);
    expect(decision.quotes?.askPrice).toBeGreaterThan(0.50);
    expect(decision.defensiveSpreadMultiplier).toBe(1.0);
  });

  it('switches to DEFENSIVE_WIDEN and expands quoting spreads under toxic informed flow', () => {
    const pipeline = new DeskHarmonizerPipeline({ toxicVpinThreshold: 0.50 });
    const classifier = pipeline.getClassifier();

    // Record severe informed buy imbalance to spike VPIN
    for (let i = 0; i < 6; i++) {
      classifier.recordTrade('market-toxic', {
        tradeId: `tx-${i}`,
        price: 0.62,
        volume: 600,
        arrivalMidPrice: 0.60,
        timestampMs: 1000 + i * 100,
      });
    }

    const decision = pipeline.executeCycle({
      marketId: 'market-toxic',
      leadVenue: 'Binance',
      lagVenue: 'Polymarket',
      symbol: 'ETH',
      currentMidPrice: 0.60,
      netInventory: 0,
      timeToExpirySec: 86400 * 3,
      timestampMs: 2000,
    });

    expect(decision.state).toBe('DEFENSIVE_WIDEN');
    expect(decision.toxicity?.isAdverseSelectionImminent).toBe(true);
    expect(decision.defensiveSpreadMultiplier).toBeGreaterThan(1.5);
    expect(decision.quotes?.bidSize).toBeLessThan(100);
  });
});
