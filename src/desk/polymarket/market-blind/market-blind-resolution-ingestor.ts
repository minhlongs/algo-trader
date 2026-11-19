/**
 * Market-Blind Gamma/CTF Resolution Ingestor & OOS Skill Gate Evaluator.
 *
 * Maps resolved Polymarket Gamma/CTF outcomes (`outcome: 0 | 1`) into a
 * `DurableMarketBlindLedger`, computes Brier / BSS_OOS / ECE via
 * `market-blind-calibrator.ts`, and evaluates `evaluateSkillGate` (ensuring
 * fail-closed `w_skill = 0` whenever `< 150` resolved OOS forecasts or any gate fails).
 */

import { evaluateCalibrationMetrics } from './market-blind-calibrator';
import type { DurableMarketBlindLedger } from './market-blind-ledger-store';
import { evaluateSkillGate } from './market-blind-shrunk-posterior';
import type {
  CalibrationMetrics,
  MarketBlindPosteriorConfig,
  OosEvaluationRecord,
  SealedForecastReceipt,
  SkillGateFailureReason,
} from './market-blind-types';

export interface GammaResolutionRecord {
  questionId: string;
  outcome: 0 | 1;
  resolvedAtMs: number;
  marketPriceAtCommit: number;
  marketObservedAtMs: number;
  /** Optional receipt hash when multiple forecasts exist for the same questionId. */
  forecastEntryHash?: string;
}

export interface ResolutionIngestError {
  questionId: string;
  reason: string;
}

export interface ResolutionIngestSummary {
  ingestedCount: number;
  skippedAlreadyResolved: number;
  unmatchedQuestionIds: string[];
  errors: ResolutionIngestError[];
}

export interface LedgerSkillEvaluationOptions {
  category?: string;
  calibrate?: (pRaw: number) => number;
  config?: Partial<MarketBlindPosteriorConfig>;
}

export interface LedgerSkillStatus {
  category?: string;
  resolvedCount: number;
  metrics: CalibrationMetrics;
  passed: boolean;
  wSkill: number;
  loggingOnly: boolean;
  reasons: SkillGateFailureReason[];
}

function resolveMatchingReceipts(
  ledger: DurableMarketBlindLedger,
  record: GammaResolutionRecord,
): SealedForecastReceipt[] {
  if (record.forecastEntryHash) {
    const exact = ledger.getReceiptByHash(record.forecastEntryHash);
    return exact ? [exact] : [];
  }
  return ledger.getReceiptsByQuestionId(record.questionId);
}

/**
 * Ingests resolved Gamma/CTF binary market outcomes into `DurableMarketBlindLedger`.
 * Idempotent for already-resolved receipts and records unmatched/invalid entries cleanly.
 */
export function ingestResolvedMarketsIntoLedger(
  ledger: DurableMarketBlindLedger,
  records: readonly GammaResolutionRecord[],
): ResolutionIngestSummary {
  let ingestedCount = 0;
  let skippedAlreadyResolved = 0;
  const unmatchedQuestionIds: string[] = [];
  const errors: ResolutionIngestError[] = [];

  for (const record of records) {
    const matches = resolveMatchingReceipts(ledger, record);
    if (matches.length === 0) {
      unmatchedQuestionIds.push(record.questionId);
      continue;
    }

    for (const receipt of matches) {
      if (ledger.isResolved(receipt.entryHash)) {
        skippedAlreadyResolved += 1;
        continue;
      }
      try {
        ledger.recordResolution({
          receipt,
          marketPriceAtCommit: record.marketPriceAtCommit,
          marketObservedAtMs: record.marketObservedAtMs,
          outcome: record.outcome,
          resolvedAtMs: record.resolvedAtMs,
        });
        ingestedCount += 1;
      } catch (err: unknown) {
        errors.push({
          questionId: record.questionId,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { ingestedCount, skippedAlreadyResolved, unmatchedQuestionIds, errors };
}

/**
 * Evaluates OOS Brier, BSS_OOS, 95% lower bound, 10-bin ECE, rolling 100-market Brier,
 * and the 5-gate `evaluateSkillGate` over resolved ledger entries.
 * Fail-closed: `wSkill === 0` (`loggingOnly === true`) whenever `< 150` resolved OOS
 * forecasts or any gate fails.
 */
export function evaluateLedgerSkillStatus(
  ledger: DurableMarketBlindLedger,
  options: LedgerSkillEvaluationOptions = {},
): LedgerSkillStatus {
  const samples = ledger
    .resolvedSamples(options.category)
    .sort((a, b) => a.resolvedAtMs - b.resolvedAtMs || a.receipt.loggedAtMs - b.receipt.loggedAtMs);

  const calibrate = options.calibrate;
  const oosRecords: OosEvaluationRecord[] = samples.map((sample) => ({
    pCal: calibrate ? calibrate(sample.receipt.pRaw) : sample.receipt.pRaw,
    pMarket: sample.marketPriceAtCommit,
    outcome: sample.outcome,
  }));

  const metrics = evaluateCalibrationMetrics(oosRecords);
  const gate = evaluateSkillGate(metrics, options.config);

  return {
    category: options.category,
    resolvedCount: metrics.resolvedCount,
    metrics,
    passed: gate.passed,
    wSkill: gate.wSkill,
    loggingOnly: gate.wSkill === 0,
    reasons: gate.reasons,
  };
}
