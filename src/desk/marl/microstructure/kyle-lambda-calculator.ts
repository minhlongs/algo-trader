/**
 * Kyle's Lambda Price Impact Calculator for MARL Microstructure Alpha.
 * Estimates Kyle's lambda (lambda) via rolling OLS regression of price changes
 * on signed order flow: dP = lambda * Q + epsilon.
 * Maintains an adaptive EMA baseline and computes instantaneous impact ratio.
 * Strict Visual LOC Budget: <= 200 lines. Conforms to AGENTS.md Hard Rules.
 */
import { z } from 'zod';

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

export interface TradeSample {
  deltaP: number;
  signedVolume: number;
  timestamp: number;
}

export interface KyleLambdaMetrics {
  lambda: number;
  baselineLambda: number;
  lambdaRatio: number;
  sampleCount: number;
  isIlliquid: boolean;
  tStat: number;
  varQ: number;
  rSquared: number;
}

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
    if (this.config.initialPrice !== undefined) {
      this.lastPrice = this.config.initialPrice;
    }
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
    const effVol = signedVolume !== 0 ? signedVolume : (deltaP > 0 ? quantity : deltaP < 0 ? -quantity : 0);
    this.addInterval(deltaP, effVol, timestamp);
  }

  public addInterval(deltaP: number, signedVolume: number, timestamp: number = Date.now()): void {
    if (!Number.isFinite(deltaP) || !Number.isFinite(signedVolume)) return;
    this.samples.push({ deltaP, signedVolume, timestamp });
    if (this.samples.length > this.config.windowSize) this.samples.shift();
    if (this.config.enableEmaBaseline && this.samples.length >= this.config.minSamples) {
      this.updateEmaBaseline();
    }
  }

  public ingestInterval(deltaP: number, signedVolume: number, timestamp: number = Date.now()): void {
    this.addInterval(deltaP, signedVolume, timestamp);
  }

  public getMetrics(): KyleLambdaMetrics {
    const n = this.samples.length;
    if (n < this.config.minSamples) {
      return {
        lambda: this.currentBaseline, baselineLambda: this.currentBaseline,
        lambdaRatio: 1.0, sampleCount: n, isIlliquid: false, tStat: 0, varQ: 0, rSquared: 0,
      };
    }

    let sumP = 0, sumQ = 0;
    for (let i = 0; i < n; i++) {
      sumP += this.samples[i].deltaP;
      sumQ += this.samples[i].signedVolume;
    }
    const meanP = sumP / n, meanQ = sumQ / n;

    let covPQ = 0, varQ = 0, sst = 0;
    for (let i = 0; i < n; i++) {
      const qDev = this.samples[i].signedVolume - meanQ;
      const pDev = this.samples[i].deltaP - meanP;
      covPQ += pDev * qDev;
      varQ += qDev * qDev;
      sst += pDev * pDev;
    }

    if (varQ < 1e-12) {
      return {
        lambda: this.currentBaseline, baselineLambda: this.currentBaseline,
        lambdaRatio: 1.0, sampleCount: n, isIlliquid: false, tStat: 0, varQ: 0, rSquared: 0,
      };
    }

    const rawLambda = covPQ / varQ;
    const lambda = Math.max(0, rawLambda);
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const pred = rawLambda * this.samples[i].signedVolume;
      sse += Math.pow(this.samples[i].deltaP - pred, 2);
    }

    const df = Math.max(1, n - 2);
    const se = Math.sqrt(sse / Math.max(1e-12, df * varQ));
    const tStat = se > 1e-12 ? lambda / se : lambda > 0 ? 999.0 : 0;
    const rSquared = sst > 1e-12 ? Math.max(0, Math.min(1, 1 - sse / sst)) : 0;
    const lambdaRatio = lambda / Math.max(1e-9, this.currentBaseline);
    const isIlliquid = lambdaRatio >= this.config.illiquidRatioThreshold;

    return {
      lambda, baselineLambda: this.currentBaseline, lambdaRatio,
      sampleCount: n, isIlliquid, tStat, varQ, rSquared,
    };
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

  private updateEmaBaseline(): void {
    const n = this.samples.length;
    let sumP = 0, sumQ = 0;
    for (let i = 0; i < n; i++) { sumP += this.samples[i].deltaP; sumQ += this.samples[i].signedVolume; }
    const meanP = sumP / n, meanQ = sumQ / n;
    let cov = 0, vq = 0;
    for (let i = 0; i < n; i++) {
      const qd = this.samples[i].signedVolume - meanQ;
      cov += (this.samples[i].deltaP - meanP) * qd;
      vq += qd * qd;
    }
    if (vq >= 1e-12) {
      const estLambda = Math.max(0, cov / vq);
      this.currentBaseline = (1 - this.config.emaAlpha) * this.currentBaseline + this.config.emaAlpha * estLambda;
    }
  }
}
