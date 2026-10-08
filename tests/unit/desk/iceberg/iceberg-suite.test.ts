import { describe, it, expect } from 'vitest';
import { IcebergReplenishmentDetector } from '../../../../src/desk/iceberg/iceberg-replenishment-detector';
import { TradeExecutionPrint, BookLevelSnapshot } from '../../../../src/desk/iceberg/iceberg-types';

describe('HFT Hidden Liquidity & Iceberg Order Detection Desk Suite', () => {
  it('detects hidden iceberg replenishment from trade executions and book refreshes', () => {
    const detector = new IcebergReplenishmentDetector();

    const priceLevel = 100.50;
    const initialVisibleSize = 500;

    // Series of trades totaling 2,000 shares executed at 100.50
    const trades: TradeExecutionPrint[] = [
      { timestampMs: 1000, price: 100.50, quantity: 400, aggressorSide: 'SELL' },
      { timestampMs: 1050, price: 100.50, quantity: 450, aggressorSide: 'SELL' },
      { timestampMs: 1100, price: 100.50, quantity: 500, aggressorSide: 'SELL' },
      { timestampMs: 1150, price: 100.50, quantity: 650, aggressorSide: 'SELL' },
    ];

    // Book snapshots showing visible volume repeatedly replenishing back to 500
    const snapshots: BookLevelSnapshot[] = [
      { timestampMs: 990, price: 100.50, visibleSize: 500 },
      { timestampMs: 1010, price: 100.50, visibleSize: 100 },
      { timestampMs: 1020, price: 100.50, visibleSize: 500 }, // Replenish #1 (+400)
      { timestampMs: 1060, price: 100.50, visibleSize: 50 },
      { timestampMs: 1070, price: 100.50, visibleSize: 500 }, // Replenish #2 (+450)
      { timestampMs: 1110, price: 100.50, visibleSize: 0 },
      { timestampMs: 1120, price: 100.50, visibleSize: 500 }, // Replenish #3 (+500)
    ];

    const res = detector.detectIceberg(priceLevel, initialVisibleSize, trades, snapshots);

    expect(res.isIcebergPresent).toBe(true);
    expect(res.replenishmentCount).toBeGreaterThanOrEqual(2);
    expect(res.totalExecutedVolume).toBe(2000);
    expect(res.estimatedHiddenRemaining).toBeGreaterThan(0);
    expect(res.confidenceScore).toBeGreaterThan(0.70);
  });
});
