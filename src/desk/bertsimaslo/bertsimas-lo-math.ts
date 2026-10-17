import { BertsimasLoConfig, ExecutionStep } from './bertsimas-lo-types';

export class BertsimasLoMath {
  public static computeTrajectory(config: BertsimasLoConfig): ExecutionStep[] {
    const { initialShares: S, periods: T, initialPrice: P0, permanentImpactCoeff: theta, temporaryImpactCoeff: c } = config;
    const isBuy = config.isBuy ?? true;
    const rho = config.informationPersistence ?? 0;
    const gamma = config.informationImpactCoeff ?? 0;
    const X0 = config.initialInformationState ?? 0;
    const dir = isBuy ? 1.0 : -1.0;

    const steps: ExecutionStep[] = [];
    let remShares = S;
    let prevP = P0;
    let currentX = X0;

    for (let k = 1; k <= T; k++) {
      const remainingPeriods = T - k + 1;
      let tradeShares: number;

      if (k === T) {
        tradeShares = remShares;
      } else {
        const twapBase = remShares / remainingPeriods;
        let h_k = 0;
        if (Math.abs(gamma) > 1e-9 && Math.abs(currentX) > 1e-9 && Math.abs(1 - rho) > 1e-9) {
          const denom = Math.max(1e-6, 2.0 * c + theta) * (1.0 - rho) * remainingPeriods;
          h_k = (gamma * rho * (1.0 - Math.pow(rho, remainingPeriods - 1))) / denom;
        }
        // If buying and positive momentum, accelerate; if selling, delay to get higher price
        const adjustment = (isBuy ? 1.0 : -1.0) * h_k * currentX;
        tradeShares = Math.max(0.0, Math.min(remShares, twapBase + adjustment));
      }

      currentX = rho * currentX;
      const permPrice = prevP + dir * theta * tradeShares + gamma * currentX;
      const execPrice = permPrice + dir * c * tradeShares;
      const periodCashFlow = tradeShares * execPrice;

      steps.push({
        period: k,
        tradeShares: Number(tradeShares.toFixed(4)),
        remainingShares: Number(Math.max(0, remShares - tradeShares).toFixed(4)),
        expectedPermanentPrice: Number(permPrice.toFixed(4)),
        expectedExecutedPrice: Number(execPrice.toFixed(4)),
        periodCashFlow: Number(periodCashFlow.toFixed(4)),
      });

      remShares -= tradeShares;
      prevP = permPrice;
    }

    return steps;
  }

  public static computeBenchmarkTwapCost(config: BertsimasLoConfig): number {
    const twapConfig: BertsimasLoConfig = {
      ...config,
      informationPersistence: 0,
      informationImpactCoeff: 0,
      initialInformationState: 0,
    };
    const steps = this.computeTrajectory(twapConfig);
    return steps.reduce((sum, s) => sum + s.periodCashFlow, 0);
  }

  public static computeImmediateCost(config: BertsimasLoConfig): number {
    const { initialShares: S, initialPrice: P0, permanentImpactCoeff: theta, temporaryImpactCoeff: c } = config;
    const isBuy = config.isBuy ?? true;
    const dir = isBuy ? 1.0 : -1.0;
    const gamma = config.informationImpactCoeff ?? 0;
    const rho = config.informationPersistence ?? 0;
    const X1 = rho * (config.initialInformationState ?? 0);

    const permPrice = P0 + dir * theta * S + gamma * X1;
    const execPrice = permPrice + dir * c * S;
    return S * execPrice;
  }
}
