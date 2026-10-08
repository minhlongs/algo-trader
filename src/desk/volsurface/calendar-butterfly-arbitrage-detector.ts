import { SviParameters, ArbitrageCheckResult } from './volsurface-types';
import { SviCalibrator } from './svi-calibrator';

export class CalendarButterflyArbitrageDetector {
  private calibrator = new SviCalibrator();

  /**
   * Verifies absence of butterfly arbitrage across log-moneyness grid:
   * g(k) >= 0 for all k in [kMin, kMax]
   */
  public checkButterflyArbitrage(params: SviParameters, kMin = -1.5, kMax = 1.5, steps = 60): {
    hasButterflyArbitrage: boolean;
    minDurrlemanValue: number;
    violationPoints: number[];
  } {
    let minG = Infinity;
    const violations: number[] = [];
    const dk = (kMax - kMin) / steps;

    for (let i = 0; i <= steps; i++) {
      const k = kMin + i * dk;
      const g = this.calibrator.evaluateDurrlemanCondition(k, params);
      if (g < minG) minG = g;
      if (g < -1e-6) {
        violations.push(Number(k.toFixed(4)));
      }
    }

    return {
      hasButterflyArbitrage: violations.length > 0,
      minDurrlemanValue: Number(minG.toFixed(6)),
      violationPoints: violations,
    };
  }

  /**
   * Verifies calendar arbitrage between two consecutive slices:
   * Total variance w(k, T_2) >= w(k, T_1) for all k when T_2 > T_1
   */
  public checkCalendarArbitrage(
    paramsNear: SviParameters,
    paramsFar: SviParameters,
    kMin = -1.5,
    kMax = 1.5,
    steps = 60
  ): {
    hasCalendarArbitrage: boolean;
    violationPoints: number[];
  } {
    const violations: number[] = [];
    const dk = (kMax - kMin) / steps;

    for (let i = 0; i <= steps; i++) {
      const k = kMin + i * dk;
      const wNear = this.calibrator.evaluateTotalVariance(k, paramsNear);
      const wFar = this.calibrator.evaluateTotalVariance(k, paramsFar);

      if (wFar < wNear - 1e-6) {
        violations.push(Number(k.toFixed(4)));
      }
    }

    return {
      hasCalendarArbitrage: violations.length > 0,
      violationPoints: violations,
    };
  }

  /**
   * Comprehensive validation combining butterfly and calendar arbitrage
   */
  public runFullAudit(
    slices: { expiryYears: number; params: SviParameters }[]
  ): ArbitrageCheckResult {
    const details: string[] = [];
    let totalViolations = 0;
    let overallMinDurrleman = Infinity;
    let calendarArbFound = false;
    let butterflyArbFound = false;

    // 1. Butterfly check per slice
    for (let idx = 0; idx < slices.length; idx++) {
      const s = slices[idx]!;
      const bf = this.checkButterflyArbitrage(s.params);
      if (bf.minDurrlemanValue < overallMinDurrleman) overallMinDurrleman = bf.minDurrlemanValue;
      if (bf.hasButterflyArbitrage) {
        butterflyArbFound = true;
        totalViolations += bf.violationPoints.length;
        details.push(`Slice T=${s.expiryYears} has ${bf.violationPoints.length} butterfly arbitrage points`);
      }
    }

    // 2. Calendar monotonicity check between adjacent slices
    for (let idx = 0; idx < slices.length - 1; idx++) {
      const s1 = slices[idx]!;
      const s2 = slices[idx + 1]!;
      const cal = this.checkCalendarArbitrage(s1.params, s2.params);
      if (cal.hasCalendarArbitrage) {
        calendarArbFound = true;
        totalViolations += cal.violationPoints.length;
        details.push(`Calendar inversion detected between T=${s1.expiryYears} and T=${s2.expiryYears}`);
      }
    }

    return {
      hasCalendarArbitrage: calendarArbFound,
      hasButterflyArbitrage: butterflyArbFound,
      violationsCount: totalViolations,
      minDurrlemanValue: Number(overallMinDurrleman.toFixed(6)),
      details,
    };
  }
}
