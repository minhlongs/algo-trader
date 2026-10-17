/**
 * Adverse Selection Guard for MARL Market-Making.
 * Integrates VPIN and Kyle's Lambda estimators to compute order flow toxicity,
 * dynamically widen Avellaneda-Stoikov quoting spreads, detect informed sweep bursts,
 * and execute instant quote cancellation tripwires with cooldown protection.
 * Strict Visual LOC Budget: <= 200 lines. Conforms to AGENTS.md Hard Rules.
 */
import { logger } from '../../../shared/utils/logger';
import { VpinCalculator } from './vpin-calculator';
import { KyleLambdaCalculator } from './kyle-lambda-calculator';
import {
  AdverseSelectionGuardConfigSchema,
  type AdverseSelectionGuardConfig,
  type ToxicityMetricsSnapshot,
  type SweepDetectionResult,
  type QuoteCancellationCallback,
  DynamicQuoteWideningController,
  InformedSweepDetector,
  InstantCancellationTripwire,
} from './adverse-selection-controllers';

export type {
  AdverseSelectionGuardConfig,
  ToxicityMetricsSnapshot,
  SweepDetectionResult,
  QuoteCancellationCallback,
};
export {
  AdverseSelectionGuardConfigSchema,
  DynamicQuoteWideningController,
  InformedSweepDetector,
  InstantCancellationTripwire,
};

export class AdverseSelectionGuard {
  public readonly config: AdverseSelectionGuardConfig;
  public readonly vpin: VpinCalculator;
  public readonly kyleLambda: KyleLambdaCalculator;
  public readonly wideningCtrl: DynamicQuoteWideningController;
  public readonly sweepDetector: InformedSweepDetector;
  public readonly tripwire: InstantCancellationTripwire;
  private cancelCallback?: QuoteCancellationCallback;
  private lastSnapshot?: ToxicityMetricsSnapshot;

  constructor(cfg?: Partial<AdverseSelectionGuardConfig>, vpin?: VpinCalculator, kyle?: KyleLambdaCalculator) {
    this.config = AdverseSelectionGuardConfigSchema.parse(cfg ?? {});
    this.vpin = vpin ?? new VpinCalculator();
    this.kyleLambda = kyle ?? new KyleLambdaCalculator();
    this.wideningCtrl = new DynamicQuoteWideningController(
      this.config.maxWideningMultiplier,
      this.config.vpinCdfHurdle,
      this.config.vpinWideningAlpha,
      this.config.lambdaWideningBeta,
    );
    this.sweepDetector = new InformedSweepDetector(
      this.config.sweepWindowMs,
      this.config.sweepLevelThreshold,
      this.config.jumpSigmaMultiplier,
    );
    this.tripwire = new InstantCancellationTripwire(
      this.config.tripwireVpinCdfThreshold,
      this.config.cooldownMs,
      this.config.tripwireLambdaThreshold,
    );
  }

  public registerCancellationCallback(cb: QuoteCancellationCallback): void {
    this.cancelCallback = cb;
  }

  public ingestTrade(trade: {
    price: number;
    volume: number;
    bidPrice?: number;
    askPrice?: number;
    timestamp?: number;
    side?: 'buy' | 'sell';
  }): void {
    const ts = trade.timestamp ?? Date.now();
    this.vpin.addTrade({
      price: trade.price,
      quantity: trade.volume,
      timestamp: ts,
      side: trade.side,
      midpoint: trade.bidPrice && trade.askPrice ? (trade.bidPrice + trade.askPrice) / 2 : undefined,
    });
    this.kyleLambda.addTrade(trade.price, trade.volume, trade.side === 'sell' ? -trade.volume : trade.volume, ts);
  }

  public evaluate(currentMid: number, sigmaMid = 0.01, timestamp = Date.now()): ToxicityMetricsSnapshot {
    const vpinMetrics = this.vpin.getMetrics();
    const kyleMetrics = this.kyleLambda.getMetrics();
    const sweep = this.sweepDetector.checkSweep(currentMid, sigmaMid, timestamp);
    const widening = this.wideningCtrl.calculateMultiplier(vpinMetrics.cdf, kyleMetrics.lambdaRatio);
    const trip = this.tripwire.evaluate(vpinMetrics.cdf, kyleMetrics.lambdaRatio, sweep.sweepDetected, timestamp);

    if (trip.tripwireActive && this.cancelCallback) {
      try {
        const res = this.cancelCallback();
        if (res instanceof Promise) {
          res.catch((e: unknown) => logger.warn('Quote cancellation rejected', { err: String(e) }));
        }
      } catch (e: unknown) {
        logger.warn('Quote cancellation callback threw error', { err: String(e) });
      }
    }

    const snap: ToxicityMetricsSnapshot = {
      vpin: vpinMetrics.vpin,
      vpinZScore: vpinMetrics.zScore,
      vpinZscore: vpinMetrics.zScore,
      vpinCdf: vpinMetrics.cdf,
      kylesLambda: kyleMetrics.lambda,
      kylesLambdaTStat: kyleMetrics.tStat,
      lambdaRatio: kyleMetrics.lambdaRatio,
      sweepDetected: sweep.sweepDetected,
      wideningMultiplier: widening,
      tripwireActive: trip.tripwireActive,
      isTripwireActive: trip.tripwireActive,
      activeReason: trip.reason,
      timestamp,
    };
    this.lastSnapshot = snap;
    return snap;
  }

  public getSnapshot(): ToxicityMetricsSnapshot | undefined {
    return this.lastSnapshot;
  }

  public isTripwireActive(): boolean {
    return this.lastSnapshot?.tripwireActive ?? false;
  }

  public reset(): void {
    this.tripwire.reset();
    this.vpin.reset();
    this.kyleLambda.reset();
    this.lastSnapshot = undefined;
  }
}
