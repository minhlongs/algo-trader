/**
 * Kyle's Lambda & Almgren-Chriss Price Impact Estimator
 * Models permanent inventory price displacement and temporary execution friction.
 *
 * @module desk/simulation/kyle-lambda-impact-model
 */

import type {
  ImpactModelConfig,
  PriceImpactMetrics,
  TradeTick,
} from './kyle-lambda-impact-types';

export class KyleLambdaImpactModel {
  private readonly halfSpreadBps: number;
  private readonly temporaryEta: number;
  private readonly decayFactor: number;
  private readonly minSamples: number;

  private sumQ = 0;
  private sumP = 0;
  private sumQQ = 0;
  private sumQP = 0;
  private sumPP = 0;
  private count = 0;

  public constructor(config: ImpactModelConfig = {}) {
    this.halfSpreadBps = config.halfSpreadBps ?? 5.0;
    this.temporaryEta = config.temporaryEta ?? 0.05;
    this.decayFactor = config.decayFactor ?? 0.98;
    this.minSamples = config.minSamples ?? 10;
  }

  public recordObservation(tick: TradeTick): void {
    const q = tick.signedVolume;
    const p = tick.priceChange;

    this.sumQ = this.sumQ * this.decayFactor + q;
    this.sumP = this.sumP * this.decayFactor + p;
    this.sumQQ = this.sumQQ * this.decayFactor + q * q;
    this.sumQP = this.sumQP * this.decayFactor + q * p;
    this.sumPP = this.sumPP * this.decayFactor + p * p;
    this.count += 1;
  }

  public calculateImpact(orderSize: number, currentPrice: number): PriceImpactMetrics {
    if (this.count < this.minSamples || currentPrice <= 0) {
      return {
        permanentImpactBps: 0,
        temporaryImpactBps: this.halfSpreadBps,
        totalExpectedSlippageBps: this.halfSpreadBps,
        lambda: 0,
        rSquared: 0,
        sampleCount: this.count,
      };
    }

    // Effective sample size under geometric weighting
    const effectiveN = (1 - Math.pow(this.decayFactor, this.count)) / (1 - this.decayFactor);
    const meanQ = this.sumQ / effectiveN;
    const meanP = this.sumP / effectiveN;

    const varQ = Math.max(1e-9, this.sumQQ / effectiveN - meanQ * meanQ);
    const covQP = this.sumQP / effectiveN - meanQ * meanP;
    const varP = Math.max(1e-9, this.sumPP / effectiveN - meanP * meanP);

    // Kyle's lambda slope: Delta P = lambda * Q
    const lambda = Math.max(0, covQP / varQ);
    const correlation = covQP / Math.sqrt(varQ * varP);
    const rSquared = Math.max(0, Math.min(1.0, correlation * correlation));

    // Permanent impact in basis points: (lambda * Q / price) * 10,000
    const permPriceDelta = lambda * Math.abs(orderSize);
    const permanentImpactBps = (permPriceDelta / currentPrice) * 10_000;

    // Temporary impact: Half spread + eta * sqrt(Q)
    const tempFrictionBps = this.halfSpreadBps + this.temporaryEta * Math.sqrt(Math.abs(orderSize));

    const totalSlippageBps = permanentImpactBps + tempFrictionBps;

    return {
      permanentImpactBps: Math.round(permanentImpactBps * 100) / 100,
      temporaryImpactBps: Math.round(tempFrictionBps * 100) / 100,
      totalExpectedSlippageBps: Math.round(totalSlippageBps * 100) / 100,
      lambda: Math.round(lambda * 1e8) / 1e8,
      rSquared: Math.round(rSquared * 1000) / 1000,
      sampleCount: this.count,
    };
  }
}
