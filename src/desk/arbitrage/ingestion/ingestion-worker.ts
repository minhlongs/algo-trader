/**
 * Opportunity Ingestion Worker
 * Processes single opportunity evaluations and handles admission/rejection lifecycle callbacks.
 */

import type { ArbitrageOpportunity } from '../spread-detector-types';
import type { NetProfitabilityAnalysis } from '../net-profitability-calculator';
import { logger } from '../../../shared/utils/logger';
import type {
  IngestionMetrics,
  IngestionPipelineDeps,
  OpportunityEvaluationResult,
} from './ingestion-types';

export interface ProcessWorkerParams {
  opp: ArbitrageOpportunity;
  metrics: IngestionMetrics;
  evaluateFn: (opp: ArbitrageOpportunity) => Promise<OpportunityEvaluationResult>;
  onAdmittedCallback?: IngestionPipelineDeps['onAdmitted'];
  onRejectedCallback?: IngestionPipelineDeps['onRejected'];
}

export async function processOpportunityWorker({
  opp,
  metrics,
  evaluateFn,
  onAdmittedCallback,
  onRejectedCallback,
}: ProcessWorkerParams): Promise<void> {
  let isAdmitted = false;
  let isRejected = false;
  let evalResult: OpportunityEvaluationResult | undefined;

  try {
    evalResult = await evaluateFn(opp);

    if (evalResult.passed) {
      isAdmitted = true;
      metrics.admittedCount++;
      logger.info('[OpportunityIngestionPipeline] Opportunity admitted', {
        id: opp.id,
        symbol: opp.symbol,
        buyVenue: opp.buyExchange,
        sellVenue: opp.sellExchange,
        netProfitBps: evalResult.analysis.netProfitBps.toFixed(2),
        netProfitUsd: evalResult.analysis.netProfitUsd.toFixed(2),
      });
    } else {
      isRejected = true;
      metrics.rejectedCount++;
      const reason = evalResult.rejectionReason ?? 'BELOW_HURDLE';
      logger.debug('[OpportunityIngestionPipeline] Opportunity rejected', {
        id: opp.id,
        symbol: opp.symbol,
        reason,
        netProfitBps: evalResult.analysis.netProfitBps.toFixed(2),
      });
    }
  } catch (err: unknown) {
    if (!isAdmitted && !isRejected) {
      isRejected = true;
      metrics.rejectedCount++;
    }
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[OpportunityIngestionPipeline] Opportunity evaluation failed', {
      id: opp.id,
      symbol: opp.symbol,
      error: errorMsg,
    });

    if (onRejectedCallback) {
      try {
        onRejectedCallback(opp, 'EVALUATION_ERROR');
      } catch (cbErr: unknown) {
        logger.error('[OpportunityIngestionPipeline] onRejected callback threw', {
          error: cbErr instanceof Error ? cbErr.message : String(cbErr),
        });
      }
    }
    return;
  }

  if (isAdmitted && evalResult?.passed) {
    if (onAdmittedCallback) {
      try {
        await onAdmittedCallback(opp, evalResult.analysis);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error('[OpportunityIngestionPipeline] onAdmitted callback execution failed', {
          id: opp.id,
          symbol: opp.symbol,
          error: errorMsg,
        });
      }
    }
  } else if (isRejected && evalResult && !evalResult.passed) {
    if (onRejectedCallback) {
      try {
        const reason = evalResult.rejectionReason ?? 'BELOW_HURDLE';
        onRejectedCallback(opp, reason, evalResult.analysis);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error('[OpportunityIngestionPipeline] onRejected callback execution failed', {
          id: opp.id,
          symbol: opp.symbol,
          error: errorMsg,
        });
      }
    }
  }
}
