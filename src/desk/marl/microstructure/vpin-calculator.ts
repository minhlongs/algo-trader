/**
 * Volume-Synchronized Probability of Toxicity (VPIN) Calculator.
 * Measures informed trading toxicity via constant volume buckets, Lee-Ready trade
 * classification, rolling order imbalance, and statistical CDF normalization.
 * Strict Visual LOC Budget: <= 200 lines. Conforms to AGENTS.md Hard Rules.
 */
import {
  VpinConfigSchema,
  type VpinConfig,
  type TradeInput,
  type VolumeBucket,
  type VpinMetrics,
  classifyTradeTick,
  computeRawVpinFromBuckets,
  computeVpinToxicityMetrics,
} from './vpin-calculator-math';

export {
  VpinConfigSchema,
  type VpinConfig,
  type TradeInput,
  type VolumeBucket,
  type VpinMetrics,
  classifyTradeTick,
  computeRawVpinFromBuckets,
  computeVpinToxicityMetrics,
};

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
    const result = classifyTradeTick(trade, this.lastTradePrice, this.lastSign);
    this.lastTradePrice = result.lastTradePrice;
    this.lastSign = result.lastSign;
    return result.side;
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
    return computeRawVpinFromBuckets(this.completedBuckets, this.config.defaultVpin);
  }

  public getVpin(): number { return this.computeRawVpin(); }
  public calculateVpin(): number { return this.getVpin(); }

  public getMetrics(): VpinMetrics {
    return computeVpinToxicityMetrics(
      this.getVpin(),
      this.vpinHistory,
      this.completedBuckets.length,
      this.config.historicalMean,
      this.config.historicalStd
    );
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
