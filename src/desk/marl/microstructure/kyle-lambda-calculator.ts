/**
 * Kyle's Lambda Price Impact Calculator for MARL Microstructure Alpha.
 * Estimates Kyle's lambda (lambda) via rolling OLS regression of price changes
 * on signed order flow: dP = lambda * Q + epsilon.
 */
import { z } from 'zod';
import {
  type TradeSample,
  type KyleLambdaMetrics,
  computeEffectiveSignedVolume,
  computeRollingOlsMetrics,
  computeUpdatedEmaBaseline,
} from './kyle-lambda-math';

export {
  type TradeSample,
  type KyleLambdaMetrics,
  computeEffectiveSignedVolume,
  computeRollingOlsMetrics,
  computeUpdatedEmaBaseline,
} from './kyle-lambda-math';

export const KyleLambdaConfigSchema = z.object({
  windowSize: z.number().int().min(3).max(1000).default(50),
  baselineLambda: z.number().positive().default(0.0001),
  minSamples: z.number().int().min(2).default(3),
  emaAlpha: z.number().min(0.0).max(1.0).default(0.02),
  enableEmaBaseline: z.boolean().default(true),
  illiquidRatioThreshold: z.number().positive().default(2.0),
  initialPrice: z.number().positive().optional(),
});

export type KyleLambdaConfig = z.infer<typeof KyleLambdaConfigSchema>;

export class KyleLambdaCalculator {
  private readonly config: KyleLambdaConfig;
  private currentBaseline: number;
  private lastPrice: number | null = null;
  private lastTimestamp: number | null = null;
  private samples: TradeSample[] = [];

  constructor(configOrWindow?: Partial<KyleLambdaConfig> | number, baseline?: number) {
    let parsed: Partial<KyleLambdaConfig> = {};
    if (typeof configOrWindow === 'number') {
      parsed = { windowSize: configOrWindow, ...(baseline !== undefined ? { baselineLambda: baseline } : {}) };
    } else if (configOrWindow) {
      parsed = configOrWindow;
    }
    this.config = KyleLambdaConfigSchema.parse(parsed);
    this.currentBaseline = this.config.baselineLambda;
    if (this.config.initialPrice !== undefined) this.lastPrice = this.config.initialPrice;
  }

  public addTrade(price: number, quantity: number, signedVolume: number, timestamp: number): void {
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(signedVolume)) return;
    if (this.lastPrice === null) {
      this.lastPrice = price;
      this.lastTimestamp = timestamp;
      return;
    }
    const deltaP = price - this.lastPrice;
    this.lastPrice = price;
    this.lastTimestamp = timestamp;
    const effVol = computeEffectiveSignedVolume(quantity, signedVolume, deltaP);
    this.addInterval(deltaP, effVol, timestamp);
  }

  public addInterval(deltaP: number, signedVolume: number, timestamp: number = Date.now()): void {
    if (!Number.isFinite(deltaP) || !Number.isFinite(signedVolume)) return;
    this.samples.push({ deltaP, signedVolume, timestamp });
    if (this.samples.length > this.config.windowSize) this.samples.shift();
    if (this.config.enableEmaBaseline && this.samples.length >= this.config.minSamples) {
      this.currentBaseline = computeUpdatedEmaBaseline(
        this.samples,
        this.currentBaseline,
        this.config.emaAlpha,
      );
    }
  }

  public ingestInterval(deltaP: number, signedVolume: number, timestamp: number = Date.now()): void {
    this.addInterval(deltaP, signedVolume, timestamp);
  }

  public getMetrics(): KyleLambdaMetrics {
    return computeRollingOlsMetrics(
      this.samples,
      this.currentBaseline,
      this.config.minSamples,
      this.config.illiquidRatioThreshold,
    );
  }

  public getLambda(): number { return this.getMetrics().lambda; }
  public getLambdaRatio(): number { return this.getMetrics().lambdaRatio; }

  public estimate(): { lambda: number; tStat: number; varQ: number } {
    const m = this.getMetrics();
    return { lambda: m.lambda, tStat: m.tStat, varQ: m.varQ };
  }

  public reset(): void {
    this.samples = [];
    this.lastPrice = this.config.initialPrice ?? null;
    this.lastTimestamp = null;
    this.currentBaseline = this.config.baselineLambda;
  }
}
