import { describe, it, expect } from 'vitest';
import { DeltaHedgerEngine } from '../../../../src/desk/risk/delta-hedger-engine';
import type { MarketPosition } from '../../../../src/desk/risk/delta-hedger-types';

describe('DeltaHedgerEngine', () => {
  const engine = new DeltaHedgerEngine({
    toleranceDelta: 25,
    maxOrderSize: 5000,
  });

  it('recognizes delta neutrality when positions balance within tolerance', () => {
    const positions: MarketPosition[] = [
      {
        symbol: 'ELEC-2028',
        marketId: 'm1',
        side: 'YES',
        quantity: 100,
        currentPrice: 0.50,
        impliedProbability: 0.50, // Delta = +50
      },
      {
        symbol: 'ELEC-2028',
        marketId: 'm1',
        side: 'NO',
        quantity: 100,
        currentPrice: 0.50,
        impliedProbability: 0.50, // Delta = -50
      },
    ];

    const summary = engine.calculateDelta(positions);
    expect(summary.netDelta).toBe(0);
    expect(summary.isNeutral).toBe(true);
    expect(summary.recommendedHedgeSide).toBe('NONE');
    expect(engine.generateHedgeAction(positions, 0.50)).toBeNull();
  });

  it('detects long delta exposure and generates BUY_NO hedge action', () => {
    const positions: MarketPosition[] = [
      {
        symbol: 'FED-RATE',
        marketId: 'm2',
        side: 'YES',
        quantity: 1000,
        currentPrice: 0.70,
        impliedProbability: 0.70, // Delta = +700
      },
    ];

    const summary = engine.calculateDelta(positions);
    expect(summary.netDelta).toBe(700);
    expect(summary.isNeutral).toBe(false);
    expect(summary.recommendedHedgeSide).toBe('BUY_NO');
    expect(summary.requiredHedgeQuantity).toBe(700);

    const action = engine.generateHedgeAction(positions, 0.70);
    expect(action).not.toBeNull();
    expect(action?.outcome).toBe('NO');
    expect(action?.side).toBe('BUY');
    expect(action?.targetQuantity).toBe(700);
    expect(action?.urgency).toBe('IMMEDIATE');
  });

  it('detects short delta exposure and generates BUY_YES hedge action', () => {
    const positions: MarketPosition[] = [
      {
        symbol: 'WAR-PEACE',
        marketId: 'm3',
        side: 'NO',
        quantity: 800,
        currentPrice: 0.60,
        impliedProbability: 0.40, // Delta = -800 * (1 - 0.40) = -480
      },
    ];

    const summary = engine.calculateDelta(positions);
    expect(summary.netDelta).toBe(-480);
    expect(summary.isNeutral).toBe(false);
    expect(summary.recommendedHedgeSide).toBe('BUY_YES');

    const action = engine.generateHedgeAction(positions, 0.40);
    expect(action).not.toBeNull();
    expect(action?.outcome).toBe('YES');
    expect(action?.side).toBe('BUY');
    expect(action?.targetQuantity).toBe(480);
  });

  it('covers passive urgency and fallback symbol', () => {
    const defaultEngine = new DeltaHedgerEngine(); // tolerance 50
    const positions: MarketPosition[] = [
      {
        symbol: '',
        marketId: 'm4',
        side: 'YES',
        quantity: 100,
        currentPrice: 0.60,
        impliedProbability: 0.60, // netDelta = 60 > 50 (tolerance), but <= 100 (2 * tolerance) -> PASSIVE
      },
    ];

    const action = defaultEngine.generateHedgeAction(positions, 0.60);
    expect(action).not.toBeNull();
    expect(action?.urgency).toBe('PASSIVE');
    expect(action?.symbol).toBe('PRED-MKT');
  });
});
