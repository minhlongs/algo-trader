/**
 * Wave 214: Almgren, Thum, Hauptmann & Li (2005) Non-Linear Impact Math.
 *
 * Computes non-linear temporary square-root impact and linear permanent impact.
 * Strictly < 180 LOC, zero mocks, zero :any.
 */

import { AlmgrenThumConfig, AlmgrenThumOrder, TrajectoryPoint } from './almgren-thum-types';

export class AlmgrenThumMath {
  public static readonly DEFAULT_ETA = 0.142;
  public static readonly DEFAULT_ALPHA = 0.50; // Canonical square-root law
  public static readonly DEFAULT_GAMMA = 0.314;

  public static calculateTemporaryImpact(
    tradeSpeed: number,
    adv: number,
    dailyVol: number,
    eta = AlmgrenThumMath.DEFAULT_ETA,
    alpha = AlmgrenThumMath.DEFAULT_ALPHA
  ): number {
    if (adv <= 0 || tradeSpeed === 0) return 0.0;
    const normalizedSpeed = Math.abs(tradeSpeed) / adv;
    const sign = Math.sign(tradeSpeed);
    return sign * eta * dailyVol * Math.pow(normalizedSpeed, alpha);
  }

  public static calculatePermanentImpact(
    cumulativeShares: number,
    adv: number,
    dailyVol: number,
    gamma = AlmgrenThumMath.DEFAULT_GAMMA
  ): number {
    if (adv <= 0 || cumulativeShares === 0) return 0.0;
    return gamma * dailyVol * (cumulativeShares / adv);
  }

  public static simulateOptimalTrajectory(
    order: AlmgrenThumOrder,
    config: AlmgrenThumConfig
  ): {
    trajectory: TrajectoryPoint[];
    expectedTempBps: number;
    expectedPermBps: number;
    totalShortfallBps: number;
    maxPovPct: number;
  } {
    const N = Math.max(5, order.intervals ?? 50);
    const T = Math.max(1e-4, order.executionHorizonDays);
    const dt = T / N;
    const totalX = Math.max(1, order.totalShares);
    const adv = Math.max(1, config.averageDailyVolume);
    const vol = Math.max(1e-6, config.dailyVolatility);
    const eta = config.tempImpactCoeff ?? AlmgrenThumMath.DEFAULT_ETA;
    const alpha = config.tempImpactExponent ?? AlmgrenThumMath.DEFAULT_ALPHA;
    const gamma = config.permImpactCoeff ?? AlmgrenThumMath.DEFAULT_GAMMA;

    const baseSpeed = totalX / T;
    const povCapSpeed = order.participationRateCap ? order.participationRateCap * adv : Infinity;

    const trajectory: TrajectoryPoint[] = [];
    let remaining = totalX;
    let cumulativeExecuted = 0;
    let accumulatedTempCost = 0;
    let maxPov = 0;

    for (let i = 0; i < N; i++) {
      const t = i * dt;
      const speed = Math.min(baseSpeed, povCapSpeed);
      const stepShares = Math.min(remaining, speed * dt);
      const currentPov = (speed / adv) * 100.0;
      if (currentPov > maxPov) maxPov = currentPov;

      const tempImpact = this.calculateTemporaryImpact(speed, adv, vol, eta, alpha);
      const permImpact = this.calculatePermanentImpact(cumulativeExecuted + stepShares * 0.5, adv, vol, gamma);
      const instSlippageBps = (tempImpact + permImpact) * 10000.0;

      accumulatedTempCost += tempImpact * stepShares;
      cumulativeExecuted += stepShares;
      remaining = Math.max(0, remaining - stepShares);

      trajectory.push({
        step: i + 1,
        timeDays: Number((t + dt).toFixed(4)),
        remainingShares: Math.round(remaining),
        tradeSpeedSharesPerDay: Number(speed.toFixed(2)),
        temporaryImpactFraction: Number(tempImpact.toFixed(6)),
        permanentImpactFraction: Number(permImpact.toFixed(6)),
        instantaneousSlippageBps: Number(instSlippageBps.toFixed(2)),
      });
    }

    const expectedTempBps = (accumulatedTempCost / totalX) * 10000.0;
    const terminalPermImpact = this.calculatePermanentImpact(totalX, adv, vol, gamma);
    const expectedPermBps = 0.5 * terminalPermImpact * 10000.0;
    const totalShortfallBps = expectedTempBps + expectedPermBps;

    return {
      trajectory,
      expectedTempBps: Number(expectedTempBps.toFixed(2)),
      expectedPermBps: Number(expectedPermBps.toFixed(2)),
      totalShortfallBps: Number(totalShortfallBps.toFixed(2)),
      maxPovPct: Number(maxPov.toFixed(2)),
    };
  }

  public static verifySquareRootScaling(
    adv: number,
    vol: number,
    eta = AlmgrenThumMath.DEFAULT_ETA
  ): boolean {
    const v1 = adv * 0.01;
    const v2 = adv * 0.04;
    const impact1 = this.calculateTemporaryImpact(v1, adv, vol, eta, 0.5);
    const impact2 = this.calculateTemporaryImpact(v2, adv, vol, eta, 0.5);
    // Under alpha = 0.5, quadrupling speed (4x) doubles impact (2x)
    const ratio = impact2 / impact1;
    return Math.abs(ratio - 2.0) < 1e-4;
  }
}
