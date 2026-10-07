/**
 * Live StatArb Pre-Trade Risk Evaluator
 *
 * Evaluates marginal Cornish-Fisher VaR and Expected Shortfall (CVaR)
 * impact for candidate arbitrage orders against risk limits.
 *
 * @module desk/risk/live-statarb-risk-evaluator
 */

import { calculateCornishFisherVaR } from './cornish-fisher';
import { calculateExpectedShortfall } from './expected-shortfall';
import type {
  CandidateOrder,
  PreTradeRiskEvaluation,
  RiskCockpitConfig,
  RiskCockpitStatus,
} from './live-statarb-risk-types';

export class LiveStatArbRiskEvaluator {
  public static evaluateOrder(
    order: CandidateOrder,
    returns: readonly number[],
    config: Required<RiskCockpitConfig>
  ): PreTradeRiskEvaluation {
    const mutableReturns = [...returns];
    const currentVaR = calculateCornishFisherVaR(
      mutableReturns,
      config.portfolioNav,
      config.confidence,
      config.horizonDays
    );
    const currentCVaR = calculateExpectedShortfall(
      mutableReturns,
      config.portfolioNav,
      config.confidence,
      config.horizonDays
    );

    // Calculate hypothetical post-order return
    const orderNotional = order.quantity * order.price;
    const returnShock = order.expectedReturn ?? -0.02; // default conservative stress shock
    const hypotheticalReturns = [...mutableReturns, returnShock];

    const projectedVaR = calculateCornishFisherVaR(
      hypotheticalReturns,
      config.portfolioNav,
      config.confidence,
      config.horizonDays
    );
    const projectedCVaR = calculateExpectedShortfall(
      hypotheticalReturns,
      config.portfolioNav,
      config.confidence,
      config.horizonDays
    );

    const marginalVaR = Math.max(0, projectedVaR - currentVaR);
    const marginalCVaR = Math.max(0, projectedCVaR - currentCVaR);

    // Evaluate breaches
    const breachesVaR = projectedVaR > config.maxVaRThreshold;
    const breachesCVaR = projectedCVaR > config.maxCVaRThreshold;
    const notionalCapBreach = orderNotional > config.portfolioNav * 0.5;

    let allowed = true;
    let reason = 'Risk parameters within normal operational bounds';
    let cockpitStatus: RiskCockpitStatus = 'NORMAL';

    if (breachesCVaR || breachesVaR || notionalCapBreach) {
      allowed = false;
      cockpitStatus = 'CRITICAL';
      if (breachesCVaR) {
        reason = `Projected Expected Shortfall ($${projectedCVaR.toFixed(2)}) breaches CVaR limit ($${config.maxCVaRThreshold.toFixed(2)})`;
      } else if (breachesVaR) {
        reason = `Projected Cornish-Fisher VaR ($${projectedVaR.toFixed(2)}) breaches VaR limit ($${config.maxVaRThreshold.toFixed(2)})`;
      } else {
        reason = `Order notional ($${orderNotional.toFixed(2)}) exceeds 50% single-order portfolio cap`;
      }
    } else if (projectedCVaR > config.maxCVaRThreshold * 0.75) {
      cockpitStatus = 'ELEVATED';
      reason = 'Risk approaching elevated tail threshold; order permitted with monitoring';
    }

    return {
      orderId: order.orderId,
      allowed,
      reason,
      currentVaR,
      currentCVaR,
      marginalVaR,
      marginalCVaR,
      projectedCVaR,
      cockpitStatus,
      unwindTriggered: false,
    };
  }
}
