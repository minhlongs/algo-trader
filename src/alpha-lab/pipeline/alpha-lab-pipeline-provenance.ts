/**
 * Alpha-Lab Autonomous Pipeline Provenance & Ledger Integration
 */

import { join } from 'node:path';
import { logger } from '../../shared/utils/logger';
import {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
  type LedgerRecord,
  type LedgerWriteResult,
} from '../provenance/research-ledger';
import {
  writeRunCard,
  hashConfig,
  type RunCard,
  type GateResult,
  type ResultClassName,
} from '../provenance/run-card';
import type { DiscoveredAlphaCandidate } from '../alpha-discovery/continuous-discovery-pipeline';
import type { PromotionStateTransition } from '../attribution/alpha-lifecycle-state-machine';

/**
 * Validates cryptographic ledger chain integrity.
 */
export async function validateLedgerChain(ledgerPath: string): Promise<number> {
  const records = await readLedgerRecords(ledgerPath);
  return verifyLedgerChain(records);
}

/**
 * Appends a ledger record within the serial ledger queue.
 */
export function persistPipelineLedgerRecord(
  ledgerQueue: Promise<void>,
  ledgerPath: string,
  strictVerification: boolean,
  input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>,
): { nextQueue: Promise<void>; result: Promise<LedgerWriteResult> } {
  let resolveResult!: (res: LedgerWriteResult) => void;
  const resultPromise = new Promise<LedgerWriteResult>((resolve) => {
    resolveResult = resolve;
  });

  const nextQueue = ledgerQueue.then(async () => {
    try {
      if (strictVerification) {
        const records = await readLedgerRecords(ledgerPath);
        const brokenIndex = verifyLedgerChain(records);
        if (brokenIndex !== -1) {
          logger.error(
            `Ledger integrity breach at record ${brokenIndex} — halting persistence`,
            'AlphaLabAutonomousPipeline',
          );
          resolveResult({
            ok: false,
            error: `Ledger integrity breach detected at index ${brokenIndex}`,
          });
          return;
        }
      }
      const res = await appendLedgerRecord(input, ledgerPath);
      resolveResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resolveResult({ ok: false, error: msg });
    }
  });

  return { nextQueue, result: resultPromise };
}

/**
 * Writes RunCard and enqueues LedgerRecord for a discovered candidate.
 */
export async function recordCandidateProvenance(
  candidate: DiscoveredAlphaCandidate,
  symbol: string,
  timeframe: string,
  runCardDir: string,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
): Promise<RunCard> {
  const resultClass: ResultClassName = candidate.status === 'PASSED' ? 'SURVIVED' : 'REJECTED';
  const runDir = join(runCardDir, candidate.strategyId);

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

  const card = await writeRunCard(runDir, {
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
  });

  await persistLedger({
    runId: candidate.strategyId,
    configHash: card.configHash,
    resultClass,
    strategyRef: candidate.familyId,
    lifecycleState: 'DISCOVERED',
    gates: candidate.survivalGateResult?.checks ?? {},
  });

  return card;
}

/**
 * Writes RunCard and enqueues LedgerRecord for a strategy promotion transition.
 */
export async function recordPromotionProvenance(
  transition: PromotionStateTransition,
  strategyId: string,
  config: Record<string, unknown>,
  symbol: string,
  timeframe: string,
  runCardDir: string,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
): Promise<RunCard> {
  const configHash = hashConfig(config);
  const resultClass: ResultClassName =
    transition.toState === 'PROMOTED_LIVE_ELIGIBLE' ? 'LIVE_PROMOTED' : 'RETIRED';

  const gatesRecord: Record<string, boolean> = {};
  for (const g of transition.gateVerdict?.gates ?? []) {
    gatesRecord[g.id] = g.passed;
  }

  await persistLedger({
    runId: `promo-${strategyId}-${transition.timestamp}`,
    configHash,
    resultClass,
    strategyRef: strategyId,
    lifecycleState: transition.toState,
    gates: gatesRecord,
  });

  const runDir = join(runCardDir, strategyId);
  const gateResults: GateResult[] = (transition.gateVerdict?.gates ?? []).map((g) => ({
    gateId: g.id,
    passed: g.passed,
    detail: g.details,
  }));

  return writeRunCard(runDir, {
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
  });
}
