import { TradeExecutionPrint, BookLevelSnapshot, IcebergDetectionResult } from './iceberg-types';

export class IcebergReplenishmentDetector {
  public detectIceberg(
    priceLevel: number,
    initialVisibleSize: number,
    trades: TradeExecutionPrint[],
    snapshots: BookLevelSnapshot[]
  ): IcebergDetectionResult {
    const relevantTrades = trades.filter(t => Math.abs(t.price - priceLevel) < 1e-4);
    const totalExecutedVolume = relevantTrades.reduce((acc, t) => acc + t.quantity, 0);

    let replenishmentCount = 0;
    let replenishedVolume = 0;

    const sortedSnapshots = [...snapshots]
      .filter(s => Math.abs(s.price - priceLevel) < 1e-4)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    // Look for recurring refreshes of visible size after trades hit the level
    for (let i = 1; i < sortedSnapshots.length; i++) {
      const prev = sortedSnapshots[i - 1]!;
      const curr = sortedSnapshots[i]!;

      if (curr.visibleSize > prev.visibleSize) {
        replenishmentCount++;
        replenishedVolume += (curr.visibleSize - prev.visibleSize);
      }
    }

    const isIcebergPresent = totalExecutedVolume > initialVisibleSize * 1.5 || replenishmentCount >= 2;
    const estimatedDisplaySize = initialVisibleSize;
    const estimatedHiddenRemaining = Math.max(0, replenishedVolume > 0 ? (totalExecutedVolume - initialVisibleSize) : 0);

    const confidenceScore = isIcebergPresent
      ? Math.min(0.99, 0.50 + 0.15 * replenishmentCount + (totalExecutedVolume / (initialVisibleSize * 5)))
      : 0.10;

    return {
      priceLevel,
      isIcebergPresent,
      estimatedDisplaySize,
      estimatedHiddenRemaining: Math.round(estimatedHiddenRemaining),
      replenishmentCount,
      totalExecutedVolume,
      confidenceScore: Number(confidenceScore.toFixed(2)),
    };
  }
}
