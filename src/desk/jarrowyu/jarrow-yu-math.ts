import { SurvivalProbabilities } from './jarrow-yu-types';

export class JarrowYuMath {
  public static survivalA(a0: number, t: number): number {
    return Math.exp(-a0 * t);
  }

  public static jointSurvival(a0: number, b0: number, t: number): number {
    return Math.exp(-(a0 + b0) * t);
  }

  public static survivalB(a0: number, b0: number, a1: number, t: number): number {
    if (a1 === 0.0) {
      return Math.exp(-b0 * t);
    }
    const diff = a0 - a1;
    if (Math.abs(diff) < 1e-7) {
      return (1.0 + a0 * t) * Math.exp(-(a0 + b0) * t);
    }
    const term1 = (a0 / diff) * Math.exp(-(b0 + a1) * t);
    const term2 = (a1 / diff) * Math.exp(-(a0 + b0) * t);
    return Math.max(0.0, Math.min(1.0, term1 - term2));
  }

  public static computeProbabilities(
    a0: number,
    b0: number,
    a1: number,
    t: number
  ): SurvivalProbabilities {
    const sA = this.survivalA(a0, t);
    const sJoint = this.jointSurvival(a0, b0, t);
    const sB = this.survivalB(a0, b0, a1, t);

    const defaultProbA = 1.0 - sA;
    let condSB = sB;
    if (defaultProbA > 1e-10) {
      condSB = Math.max(0.0, Math.min(1.0, (sB - sJoint) / defaultProbA));
    }

    const baselineSpread = (1.0 - 0.4) * b0;
    const postContagionSpread = (1.0 - 0.4) * (b0 + a1);
    const contagionSpreadImpact = postContagionSpread - baselineSpread;

    return {
      survivalA: sA,
      survivalB: sB,
      jointSurvival: sJoint,
      conditionalSurvivalB: condSB,
      contagionSpreadImpact,
    };
  }

  public static computeCdsLegs(
    a0: number,
    b0: number,
    a1: number,
    t: number,
    r: number,
    recoveryB: number,
    steps: number = 200
  ): { protectionLegPv: number; annuityLegPv: number; spread: number } {
    const dt = t / steps;
    let protectionLegPv = 0.0;
    let annuityLegPv = 0.0;

    let prevSurv = 1.0;
    for (let i = 1; i <= steps; i++) {
      const time = i * dt;
      const tMid = time - 0.5 * dt;
      const currSurv = this.survivalB(a0, b0, a1, time);
      const defaultProbSlice = Math.max(0.0, prevSurv - currSurv);

      const discountMid = Math.exp(-r * tMid);
      protectionLegPv += (1.0 - recoveryB) * discountMid * defaultProbSlice;
      annuityLegPv += Math.exp(-r * time) * currSurv * dt;

      prevSurv = currSurv;
    }

    const spread = annuityLegPv > 1e-12 ? protectionLegPv / annuityLegPv : 0.0;
    return { protectionLegPv, annuityLegPv, spread };
  }
}
