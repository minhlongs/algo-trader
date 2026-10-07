import type {
  CompositeLiquidityScore,
  LiquidityBandDepth,
  OrderBookSnapshot,
} from './liquidity-score-types';

export interface LiquidityScoreEngineConfig {
  readonly depthBandsPct?: readonly number[];
  readonly referenceMaxSpreadBps?: number;
  readonly referenceTargetDepthUsd?: number;
}

export class LiquidityScoreEngine {
  private readonly depthBandsPct: readonly number[];
  private readonly referenceMaxSpreadBps: number;
  private readonly referenceTargetDepthUsd: number;

  public constructor(config: LiquidityScoreEngineConfig = {}) {
    this.depthBandsPct = config.depthBandsPct ?? [0.01, 0.02, 0.05];
    this.referenceMaxSpreadBps = config.referenceMaxSpreadBps ?? 500;
    this.referenceTargetDepthUsd = config.referenceTargetDepthUsd ?? 50000;
  }

  public evaluateLiquidity(snapshot: OrderBookSnapshot): CompositeLiquidityScore {
    const { marketId, timestamp, bids, asks } = snapshot;
    const sortedBids = [...bids].sort((a, b) => b.price - a.price);
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

    const bestBid = sortedBids[0]?.price ?? 0;
    const bestAsk = sortedAsks[0]?.price ?? 1;
    const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0.5;

    const spread = Math.max(0, bestAsk - bestBid);
    const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : this.referenceMaxSpreadBps;

    // Spread score: 100 if spread = 0 bps, 0 if spread >= referenceMaxSpreadBps
    const spreadScore = Math.max(
      0,
      Math.min(100, (1 - spreadBps / this.referenceMaxSpreadBps) * 100)
    );

    // Compute depth within bands
    const bands: LiquidityBandDepth[] = [];
    let weightedDepthUsd = 0;

    for (const bandPct of this.depthBandsPct) {
      const minBidPrice = midPrice * (1 - bandPct);
      const maxAskPrice = midPrice * (1 + bandPct);

      let bidNotional = 0;
      for (const b of sortedBids) {
        if (b.price >= minBidPrice) {
          bidNotional += b.price * b.quantity;
        }
      }

      let askNotional = 0;
      for (const a of sortedAsks) {
        if (a.price <= maxAskPrice) {
          askNotional += a.price * a.quantity;
        }
      }

      const totalNotional = bidNotional + askNotional;
      bands.push({
        bandPct,
        bidNotionalUsd: bidNotional,
        askNotionalUsd: askNotional,
        totalNotionalUsd: totalNotional,
      });

      // Weight tighter bands more heavily (1% has weight 3, 2% has 2, 5% has 1)
      const weight = 1 / bandPct;
      weightedDepthUsd += (totalNotional / 2) * (weight / 100);
    }

    // Depth score: scaled against referenceTargetDepthUsd
    const depthScore = Math.max(
      0,
      Math.min(100, (weightedDepthUsd / this.referenceTargetDepthUsd) * 100)
    );

    // Composite: 50% spread, 50% depth
    const compositeScore = Math.round((spreadScore * 0.5 + depthScore * 0.5) * 100) / 100;

    // Conservative max order size: 10% of 1% band depth, scaled by spread score factor
    const band1PctDepth = bands[0]?.totalNotionalUsd ?? 0;
    const maxRecommendedOrderSizeUsd = Math.round(
      (band1PctDepth * 0.1) * (spreadScore / 100) * 100
    ) / 100;

    return {
      marketId,
      timestamp,
      bestBid,
      bestAsk,
      midPrice,
      spreadBps,
      spreadScore,
      depthScore,
      compositeScore,
      bands,
      maxRecommendedOrderSizeUsd,
    };
  }
}
