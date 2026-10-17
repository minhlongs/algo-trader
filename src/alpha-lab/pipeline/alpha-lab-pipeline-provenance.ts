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
import { writeRunCard, type RunCard } from '../provenance/run-card';
import type { DiscoveredAlphaCandidate } from '../alpha-discovery/continuous-discovery-pipeline';
import type { PromotionStateTransition } from '../attribution/alpha-lifecycle-state-machine';
import {
  buildCandidateRunCardPayload,
  buildPromotionProvenancePayloads,
} from './alpha-lab-pipeline-stage-helpers';

export { buildCandidateRunCardPayload, buildPromotionProvenancePayloads };

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
  const runDir = join(runCardDir, candidate.strategyId);
  const { resultClass, input } = buildCandidateRunCardPayload(candidate, symbol, timeframe);
  const card = await writeRunCard(runDir, input);

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
  const { ledgerInput, runCardInput } = buildPromotionProvenancePayloads(
    transition,
    strategyId,
    config,
    symbol,
    timeframe,
  );
  await persistLedger(ledgerInput);
  return writeRunCard(join(runCardDir, strategyId), runCardInput);
}
