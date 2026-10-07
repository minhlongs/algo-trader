/**
 * Live StatArb Risk Cockpit
 *
 * Real-time risk orchestration engine monitoring Cornish-Fisher VaR & Expected Shortfall (CVaR).
 * Coordinates pre-trade routing gating and automated compensatory unwinds.
 *
 * @module desk/risk/live-statarb-risk-cockpit
 */

import { EventEmitter } from 'node:events';
import { logger } from '../../shared/utils/logger';
import { calculateCornishFisherVaR } from './cornish-fisher';
import { calculateExpectedShortfall } from './expected-shortfall';
import type { CompensatoryUnwindHandler } from '../arbitrage/compensatory-unwind-handler';
import { LiveStatArbRiskEvaluator } from './live-statarb-risk-evaluator';
import type {
  CandidateOrder,
  PreTradeRiskEvaluation,
  RiskCockpitConfig,
  RiskCockpitSnapshot,
  RiskCockpitStatus,
} from './live-statarb-risk-types';

export class LiveStatArbRiskCockpit extends EventEmitter {
  private readonly config: Required<RiskCockpitConfig>;
  private readonly returns: number[] = [];
  private currentStatus: RiskCockpitStatus = 'NORMAL';

  constructor(
    config: RiskCockpitConfig,
    private readonly unwindHandler?: CompensatoryUnwindHandler
  ) {
    super();
    this.config = {
      portfolioNav: config.portfolioNav,
      maxVaRThreshold: config.maxVaRThreshold ?? config.portfolioNav * 0.05, // default 5% VaR
      maxCVaRThreshold: config.maxCVaRThreshold ?? config.portfolioNav * 0.08, // default 8% CVaR
      confidence: config.confidence ?? 0.95,
      horizonDays: config.horizonDays ?? 1,
      autoUnwindOnBreach: config.autoUnwindOnBreach ?? true,
    };
  }

  public recordReturn(ret: number): void {
    if (Number.isFinite(ret)) {
      this.returns.push(ret);
      if (this.returns.length > 500) {
        this.returns.shift();
      }
    }
  }

  public recordReturns(rets: readonly number[]): void {
    for (const r of rets) {
      this.recordReturn(r);
    }
  }

  public async evaluatePreTrade(order: CandidateOrder): Promise<PreTradeRiskEvaluation> {
    const evaluation = LiveStatArbRiskEvaluator.evaluateOrder(order, this.returns, this.config);
    this.currentStatus = evaluation.cockpitStatus;

    if (!evaluation.allowed) {
      logger.warn('[LiveStatArbRiskCockpit] Order blocked by risk gate', {
        orderId: order.orderId,
        reason: evaluation.reason,
      });

      if (this.config.autoUnwindOnBreach && this.unwindHandler && evaluation.cockpitStatus === 'CRITICAL') {
        this.currentStatus = 'UNWINDING';
        evaluation.unwindTriggered = true;
        this.emit('unwindTriggered', { orderId: order.orderId, reason: evaluation.reason });

        try {
          await this.unwindHandler.executeUnwind({
            executionId: `unwind-${order.orderId}`,
            reason: evaluation.reason,
            legsToUnwind: [
              {
                legId: `leg-${order.orderId}`,
                venue: 'POLYMARKET',
                symbol: order.symbol,
                side: order.side === 'BUY' ? 'sell' : 'buy',
                filledAmount: order.quantity,
                entryPrice: order.price,
              },
            ],
          });
        } catch (error) {
          logger.error('[LiveStatArbRiskCockpit] Unwind execution error', { error });
        }
      }
    }

    return evaluation;
  }

  public getSnapshot(): RiskCockpitSnapshot {
    const varValue = calculateCornishFisherVaR(
      this.returns,
      this.config.portfolioNav,
      this.config.confidence,
      this.config.horizonDays
    );
    const esValue = calculateExpectedShortfall(
      this.returns,
      this.config.portfolioNav,
      this.config.confidence,
      this.config.horizonDays
    );

    return {
      portfolioNav: this.config.portfolioNav,
      status: this.currentStatus,
      cornishFisherVaR: varValue,
      expectedShortfall: esValue,
      returnsCount: this.returns.length,
      maxVaRThreshold: this.config.maxVaRThreshold,
      maxCVaRThreshold: this.config.maxCVaRThreshold,
      evaluatedAt: Date.now(),
    };
  }

  public getStatus(): RiskCockpitStatus {
    return this.currentStatus;
  }
}
