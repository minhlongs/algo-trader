/**
 * Configuration schemas, types, and controllers for Adverse Selection Guard.
 * Handles dynamic quoting spread widening, sweep burst detection, and cancellation tripwires.
 */
import { z } from 'zod';

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
  vpin: number;
  vpinZScore: number;
  vpinZscore?: number;
  vpinCdf: number;
  kylesLambda: number;
  kylesLambdaTStat?: number;
  lambdaRatio: number;
  sweepDetected: boolean;
  wideningMultiplier: number;
  tripwireActive: boolean;
  isTripwireActive?: boolean;
  activeReason?: string;
  timestamp?: number;
}

export interface SweepDetectionResult {
  sweepDetected: boolean;
  direction?: 'buy' | 'sell';
  levelsDepleted: number;
  volumeSwept: number;
  timeElapsedMs: number;
  fastJumpAnomaly: boolean;
}

export type QuoteCancellationCallback = () => Promise<number | void> | number | void;

export class DynamicQuoteWideningController {
  constructor(
    private readonly maxMultiplier = 5.0,
    private readonly vpinHurdle = 0.75,
    private readonly alpha = 3.0,
    private readonly beta = 1.5,
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
    private readonly windowMs = 50,
    private readonly levelThreshold = 3,
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
      levelsDepleted: Math.max(buys, sells),
      volumeSwept: this.depletions.reduce((acc, d) => acc + d.volume, 0),
      timeElapsedMs: this.windowMs,
      fastJumpAnomaly: fastJump,
    };
  }
}

export class InstantCancellationTripwire {
  private active = false;
  private cooldownUntil = 0;

  constructor(
    private readonly criticalVpinCdf = 0.95,
    private readonly cooldownMs = 500,
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

  public reset(): void {
    this.active = false;
    this.cooldownUntil = 0;
  }
}
