/**
 * Adverse Selection Guard for MARL Market-Making.
 * Integrates VPIN and Kyle's Lambda estimators to compute order flow toxicity,
 * dynamically widen Avellaneda-Stoikov quoting spreads, detect informed sweep bursts,
 * and execute instant quote cancellation tripwires with cooldown protection.
 * Strict Visual LOC Budget: <= 200 lines. Conforms to AGENTS.md Hard Rules.
 */
import { z } from 'zod';
import { logger } from '../../../shared/utils/logger';
import { VpinCalculator } from './vpin-calculator';
import { KyleLambdaCalculator } from './kyle-lambda-calculator';

export const AdverseSelectionGuardConfigSchema = z.object({
  maxWideningMultiplier: z.number().min(1.0).max(10.0).default(5.0),
  vpinCdfHurdle: z.number().min(0.0).max(1.0).default(0.75),
  vpinWideningAlpha: z.number().nonnegative().default(3.0),
  lambdaWideningBeta: z.number().nonnegative().default(1.5),
  tripwireVpinCdfThreshold: z.number().min(0.50).max(1.0).default(0.95),
  tripwireLambdaThreshold: z.number().positive().default(4.0),
  cooldownMs: z.number().int().positive().default(500),
  sweepWindowMs: z.number().int().positive().default(50),
  sweepLevelThreshold: z.number().int().positive().default(3),
  jumpSigmaMultiplier: z.number().positive().default(3.0),
});
export type AdverseSelectionGuardConfig = z.infer<typeof AdverseSelectionGuardConfigSchema>;

export interface ToxicityMetricsSnapshot {
  vpin: number; vpinZScore: number; vpinZscore?: number; vpinCdf: number;
  kylesLambda: number; kylesLambdaTStat?: number; lambdaRatio: number;
  sweepDetected: boolean; wideningMultiplier: number;
  tripwireActive: boolean; isTripwireActive?: boolean;
  activeReason?: string; timestamp?: number;
}

export interface SweepDetectionResult {
  sweepDetected: boolean; direction?: 'buy' | 'sell';
  levelsDepleted: number; volumeSwept: number;
  timeElapsedMs: number; fastJumpAnomaly: boolean;
}

export type QuoteCancellationCallback = () => Promise<number | void> | number | void;

export class DynamicQuoteWideningController {
  constructor(
    private readonly maxMultiplier = 5.0, private readonly vpinHurdle = 0.75,
    private readonly alpha = 3.0, private readonly beta = 1.5,
  ) {}

  public calculateMultiplier(vpinCdf: number, lambdaRatio: number): number {
    const vpinExcess = Math.max(0, vpinCdf - this.vpinHurdle);
    const lambdaExcess = Math.max(0, lambdaRatio - 1.0);
    return Math.min(this.maxMultiplier, Math.max(1.0, 1.0 + this.alpha * vpinExcess + this.beta * lambdaExcess));
  }
}

export class InformedSweepDetector {
  private depletions: { timestamp: number; direction: 'buy' | 'sell'; volume: number }[] = [];
  private lastMid = 0.50;

  constructor(
    private readonly windowMs = 50, private readonly levelThreshold = 3,
    private readonly jumpSigmaMul = 3.0,
  ) {}

  public registerDepletion(direction: 'buy' | 'sell', volume: number, timestamp = Date.now()): void {
    this.depletions.push({ timestamp, direction, volume });
    const cutoff = timestamp - this.windowMs;
    this.depletions = this.depletions.filter((d) => d.timestamp >= cutoff);
  }

  public checkSweep(currentMid: number, sigmaMid = 0.01, timestamp = Date.now()): SweepDetectionResult {
    const jump = Number(Math.abs(currentMid - this.lastMid).toFixed(6));
    this.lastMid = currentMid;
    const fastJump = sigmaMid > 0 && jump > Number((this.jumpSigmaMul * sigmaMid).toFixed(6));
    const cutoff = timestamp - this.windowMs;
    this.depletions = this.depletions.filter((d) => d.timestamp >= cutoff);
    const buys = this.depletions.filter((d) => d.direction === 'buy').length;
    const sells = this.depletions.filter((d) => d.direction === 'sell').length;
    const sweep = buys >= this.levelThreshold || sells >= this.levelThreshold || fastJump;
    return {
      sweepDetected: sweep,
      direction: buys >= this.levelThreshold ? 'buy' : sells >= this.levelThreshold ? 'sell' : undefined,
      levelsDepleted: Math.max(buys, sells), volumeSwept: this.depletions.reduce((acc, d) => acc + d.volume, 0),
      timeElapsedMs: this.windowMs, fastJumpAnomaly: fastJump,
    };
  }
}

export class InstantCancellationTripwire {
  private active = false;
  private cooldownUntil = 0;

  constructor(
    private readonly criticalVpinCdf = 0.95, private readonly cooldownMs = 500,
    private readonly lambdaLimit = 4.0,
  ) {}

  public evaluate(vpinCdf: number, lambdaRatio: number, sweep: boolean, now = Date.now()): { tripwireActive: boolean; reason?: string } {
    if (now < this.cooldownUntil) return { tripwireActive: true, reason: 'quarantine_cooldown_active' };
    let reason: string | undefined;
    if (vpinCdf >= this.criticalVpinCdf) reason = 'critical_vpin_breach';
    else if (lambdaRatio >= this.lambdaLimit) reason = 'liquidity_black_hole';
    else if (sweep) reason = 'informed_sweep_burst';

    if (reason) {
      this.active = true;
      this.cooldownUntil = now + this.cooldownMs;
      return { tripwireActive: true, reason };
    }
    this.active = false;
    return { tripwireActive: false };
  }

  public reset(): void { this.active = false; this.cooldownUntil = 0; }
}

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
      this.config.maxWideningMultiplier, this.config.vpinCdfHurdle,
      this.config.vpinWideningAlpha, this.config.lambdaWideningBeta,
    );
    this.sweepDetector = new InformedSweepDetector(
      this.config.sweepWindowMs, this.config.sweepLevelThreshold, this.config.jumpSigmaMultiplier,
    );
    this.tripwire = new InstantCancellationTripwire(
      this.config.tripwireVpinCdfThreshold, this.config.cooldownMs, this.config.tripwireLambdaThreshold,
    );
  }

  public registerCancellationCallback(cb: QuoteCancellationCallback): void { this.cancelCallback = cb; }

  public ingestTrade(trade: { price: number; volume: number; bidPrice?: number; askPrice?: number; timestamp?: number; side?: 'buy' | 'sell' }): void {
    const ts = trade.timestamp ?? Date.now();
    this.vpin.addTrade({
      price: trade.price, quantity: trade.volume, timestamp: ts, side: trade.side,
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
      vpin: vpinMetrics.vpin, vpinZScore: vpinMetrics.zScore, vpinZscore: vpinMetrics.zScore,
      vpinCdf: vpinMetrics.cdf, kylesLambda: kyleMetrics.lambda, kylesLambdaTStat: kyleMetrics.tStat,
      lambdaRatio: kyleMetrics.lambdaRatio, sweepDetected: sweep.sweepDetected,
      wideningMultiplier: widening, tripwireActive: trip.tripwireActive,
      isTripwireActive: trip.tripwireActive, activeReason: trip.reason, timestamp,
    };
    this.lastSnapshot = snap;
    return snap;
  }

  public getSnapshot(): ToxicityMetricsSnapshot | undefined { return this.lastSnapshot; }
  public isTripwireActive(): boolean { return this.lastSnapshot?.tripwireActive ?? false; }

  public reset(): void {
    this.tripwire.reset();
    this.vpin.reset();
    this.kyleLambda.reset();
    this.lastSnapshot = undefined;
  }
}
