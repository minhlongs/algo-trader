/**
 * Alpha-Lab Autonomous Pipeline Stage & Provenance Helpers
 * Pure payload builders for RunCard/Ledger provenance and stage persistence binding.
 */

import {
  hashConfig,
  type GateResult,
  type ResultClassName,
  type WriteRunCardInput,
} from '../provenance/run-card';
import type { LedgerRecord, LedgerWriteResult } from '../provenance/research-ledger';
import type { DiscoveredAlphaCandidate } from '../alpha-discovery/continuous-discovery-pipeline';
import type { PromotionStateTransition } from '../attribution/alpha-lifecycle-state-machine';
import type { PipelineCoreContext } from './alpha-lab-pipeline-context';
import { appendPipelineLedger } from './alpha-lab-pipeline-actions';

export function createLedgerRecordPersister(
  ctx: PipelineCoreContext
): (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult> {
  return (input) =>
    appendPipelineLedger(ctx.state, ctx.ledgerPath, ctx.strictLedgerVerification, input);
}

export function buildCandidateRunCardPayload(
  candidate: DiscoveredAlphaCandidate,
  symbol: string,
  timeframe: string
): { resultClass: ResultClassName; input: WriteRunCardInput } {
  const resultClass: ResultClassName = candidate.status === 'PASSED' ? 'SURVIVED' : 'REJECTED';
  const gateResults: GateResult[] = [];
  if (candidate.survivalGateResult) {
    for (const [k, v] of Object.entries(candidate.survivalGateResult.checks ?? {})) {
      gateResults.push({ gateId: k, passed: Boolean(v) });
    }
  }
  const warnings: string[] = [];
  if (candidate.rejectionDiagnostics) {
    for (const diag of candidate.rejectionDiagnostics) {
      warnings.push(`${diag.metric}: ${diag.reason}`);
    }
  }

  return {
    resultClass,
    input: {
      runId: candidate.strategyId,
      resultClass,
      strategyRef: candidate.familyId,
      hypothesis: `Alpha hypothesis for ${candidate.familyId} on ${symbol}`,
      dataSources: [`ccxt:${symbol}:${timeframe}`],
      metrics: {
        sharpeRatio: candidate.walkforwardSummary?.testSharpe,
        winRate: candidate.walkforwardSummary?.testWinRate,
        maxDrawdown: candidate.walkforwardSummary?.testMaxDrawdown,
      },
      gateResults,
      warnings,
      config: candidate.config as unknown as Record<string, unknown>,
    },
  };
}

export function buildPromotionProvenancePayloads(
  transition: PromotionStateTransition,
  strategyId: string,
  config: Record<string, unknown>,
  symbol: string,
  timeframe: string
): {
  ledgerInput: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>;
  runCardInput: WriteRunCardInput;
} {
  const configHash = hashConfig(config);
  const resultClass: ResultClassName =
    transition.toState === 'PROMOTED_LIVE_ELIGIBLE' ? 'LIVE_PROMOTED' : 'RETIRED';

  const gatesRecord: Record<string, boolean> = {};
  for (const g of transition.gateVerdict?.gates ?? []) {
    gatesRecord[g.id] = g.passed;
  }

  const gateResults: GateResult[] = (transition.gateVerdict?.gates ?? []).map((g) => ({
    gateId: g.id,
    passed: g.passed,
    detail: g.details,
  }));

  return {
    ledgerInput: {
      runId: `promo-${strategyId}-${transition.timestamp}`,
      configHash,
      resultClass,
      strategyRef: strategyId,
      lifecycleState: transition.toState,
      gates: gatesRecord,
    },
    runCardInput: {
      runId: strategyId,
      resultClass,
      strategyRef: strategyId,
      hypothesis: `Promotion evaluation: ${transition.toState} (${transition.reason})`,
      dataSources: [`ccxt:${symbol}:${timeframe}`],
      metrics: {
        sharpeRatio: transition.metricsSnapshot.sharpeRatio,
        winRate: transition.metricsSnapshot.winRate,
        maxDrawdown: transition.metricsSnapshot.maxDrawdown,
        profitFactor: transition.metricsSnapshot.profitFactor,
        totalTrades: transition.metricsSnapshot.totalTrades,
      },
      gateResults,
      warnings: transition.gateVerdict?.allPassed ? [] : [transition.reason],
      config,
    },
  };
}
