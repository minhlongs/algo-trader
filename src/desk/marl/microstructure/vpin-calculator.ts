/**
 * Volume-Synchronized Probability of Toxicity (VPIN) Calculator.
 * Measures informed trading toxicity via constant volume buckets, Lee-Ready trade
 * classification, rolling order imbalance, and statistical CDF normalization.
 * Strict Visual LOC Budget: <= 200 lines. Conforms to AGENTS.md Hard Rules.
 */
import { z } from 'zod';

export const VpinConfigSchema = z.object({
  bucketVolume: z.number().positive('Bucket volume must be positive').default(10_000),
  windowBuckets: z.number().int().positive('Window buckets must be positive integer').default(50),
  historicalMean: z.number().min(0).max(1).default(0.25),
  historicalStd: z.number().positive('Historical standard deviation must be positive').default(0.15),
  rollingStatsWindow: z.number().int().positive().default(500),
  minBucketsForMetrics: z.number().int().nonnegative().default(1),
  defaultVpin: z.number().min(0).max(1).default(0.0),
});

export type VpinConfig = z.infer<typeof VpinConfigSchema>;

export interface TradeInput {
  price: number;
  quantity?: number;
  volume?: number;
  timestamp: number;
  side?: 'buy' | 'sell';
  midpoint?: number;
  bidPrice?: number;
  askPrice?: number;
  tradeId?: string;
}

export interface VolumeBucket {
  bucketIndex: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  imbalance: number;
  isComplete: boolean;
  completedAt?: number;
}

export interface VpinMetrics {
  vpin: number;
  zScore: number;
  cdf: number;
  completedBuckets: number;
}

export class VpinCalculator {
  private readonly config: VpinConfig;
  private completedBuckets: VolumeBucket[] = [];
  private vpinHistory: number[] = [];
  private currentBuyVolume = 0;
  private currentSellVolume = 0;
  private lastTradePrice = 0;
  private lastSign: 'buy' | 'sell' = 'buy';
  private nextBucketIndex = 0;

  constructor(configOrBucketVolume?: number | Partial<VpinConfig>, windowBuckets?: number) {
    if (typeof configOrBucketVolume === 'number') {
      this.config = VpinConfigSchema.parse({
        bucketVolume: configOrBucketVolume,
        windowBuckets: windowBuckets ?? 50,
      });
    } else {
      this.config = VpinConfigSchema.parse(configOrBucketVolume ?? {});
    }
  }

  public classifyTrade(trade: TradeInput): 'buy' | 'sell' {
    if (trade.side === 'buy' || trade.side === 'sell') {
      this.lastSign = trade.side;
      this.lastTradePrice = trade.price;
      return trade.side;
    }
    let midpoint = trade.midpoint;
    if (midpoint === undefined && trade.bidPrice !== undefined && trade.askPrice !== undefined) {
      if (trade.bidPrice > 0 && trade.askPrice > 0 && trade.bidPrice <= trade.askPrice) {
        midpoint = (trade.bidPrice + trade.askPrice) / 2;
      }
    }
    if (midpoint !== undefined && Number.isFinite(midpoint) && midpoint > 0) {
      if (trade.price > midpoint) { this.lastSign = 'buy'; this.lastTradePrice = trade.price; return 'buy'; }
      if (trade.price < midpoint) { this.lastSign = 'sell'; this.lastTradePrice = trade.price; return 'sell'; }
    }
    if (this.lastTradePrice > 0) {
      if (trade.price > this.lastTradePrice) { this.lastSign = 'buy'; this.lastTradePrice = trade.price; return 'buy'; }
      if (trade.price < this.lastTradePrice) { this.lastSign = 'sell'; this.lastTradePrice = trade.price; return 'sell'; }
    }
    this.lastTradePrice = trade.price;
    return this.lastSign;
  }

  public addTrade(trade: TradeInput): void {
    const qty = trade.quantity ?? trade.volume ?? 0;
    if (!Number.isFinite(qty) || qty <= 1e-12 || !Number.isFinite(trade.price) || trade.price <= 0) return;
    const side = this.classifyTrade(trade);
    let remainingTrade = qty;

    while (remainingTrade > 1e-12) {
      const currentTotal = this.currentBuyVolume + this.currentSellVolume;
      const remainingCapacity = this.config.bucketVolume - currentTotal;
      if (remainingTrade < remainingCapacity - 1e-12) {
        if (side === 'buy') this.currentBuyVolume += remainingTrade;
        else this.currentSellVolume += remainingTrade;
        remainingTrade = 0;
      } else {
        if (side === 'buy') this.currentBuyVolume += remainingCapacity;
        else this.currentSellVolume += remainingCapacity;
        remainingTrade -= remainingCapacity;
        this.finalizeBucket();
      }
    }
  }

  public ingestTrade(tick: TradeInput): void { this.addTrade(tick); }

  private finalizeBucket(): void {
    const buy = this.currentBuyVolume, sell = this.currentSellVolume, total = buy + sell;
    if (total <= 0) return;
    this.completedBuckets.push({
      bucketIndex: this.nextBucketIndex++,
      buyVolume: buy,
      sellVolume: sell,
      totalVolume: total,
      imbalance: Math.abs(buy - sell),
      isComplete: true,
      completedAt: Date.now(),
    });
    if (this.completedBuckets.length > this.config.windowBuckets) this.completedBuckets.shift();
    this.vpinHistory.push(this.computeRawVpin());
    if (this.vpinHistory.length > this.config.rollingStatsWindow) this.vpinHistory.shift();
    this.currentBuyVolume = 0;
    this.currentSellVolume = 0;
  }

  public forceTimeoutBucket(): void {
    if (this.currentBuyVolume + this.currentSellVolume > 0) this.finalizeBucket();
  }

  private computeRawVpin(): number {
    if (this.completedBuckets.length === 0) return this.config.defaultVpin;
    let totalImbalance = 0, totalVolume = 0;
    for (const b of this.completedBuckets) {
      totalImbalance += b.imbalance;
      totalVolume += b.totalVolume;
    }
    if (totalVolume <= 0) return this.config.defaultVpin;
    const vpin = totalImbalance / totalVolume;
    return Math.max(0, Math.min(1, vpin === 0 ? 0 : vpin));
  }

  public getVpin(): number { return this.computeRawVpin(); }
  public calculateVpin(): number { return this.getVpin(); }

  public getMetrics(): VpinMetrics {
    const vpin = this.getVpin();
    let mean = this.config.historicalMean, std = this.config.historicalStd;
    if (this.vpinHistory.length >= 30) {
      const sum = this.vpinHistory.reduce((a, b) => a + b, 0);
      const m = sum / this.vpinHistory.length;
      const variance = this.vpinHistory.reduce((a, b) => a + (b - m) ** 2, 0) / this.vpinHistory.length;
      const s = Math.sqrt(variance);
      if (s > 1e-6) { mean = m; std = s; }
    }
    const zScore = std > 0 ? (vpin - mean) / std : 0;
    const cdf = Math.max(0, Math.min(1, 0.5 * (1 + Math.tanh(zScore * 0.797885))));
    return {
      vpin,
      zScore: Object.is(zScore, -0) ? 0 : zScore,
      cdf: Object.is(cdf, -0) ? 0 : cdf,
      completedBuckets: this.completedBuckets.length,
    };
  }

  public getCdf(): number { return this.getMetrics().cdf; }
  public getZScore(): number { return this.getMetrics().zScore; }

  public reset(): void {
    this.completedBuckets = [];
    this.vpinHistory = [];
    this.currentBuyVolume = 0;
    this.currentSellVolume = 0;
    this.lastTradePrice = 0;
    this.lastSign = 'buy';
    this.nextBucketIndex = 0;
  }
}
