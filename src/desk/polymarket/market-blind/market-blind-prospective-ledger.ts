/**
 * Immutable Prospective Forecast Ledger (IC Report Strategy 6 & Agent #3).
 *
 * Enforces the prospective commitment invariant: live market price `p_mkt` may
 * ONLY be observed AFTER raw forecast `p_raw` is committed to an append-only,
 * SHA-256 hash-chained log entry stamped with `modelVersionId`, `stateVariant`,
 * `questionId`, `category`, `loggedAtMs`, and `entryHash`.
 */

import { createHash } from 'node:crypto';
import { assertProspectiveCutoff } from './market-blind-sanitizer';
import {
  MarketBlindError,
  type ProspectiveForecastInput,
  type ResolvedForecastSample,
  type SealedForecastReceipt,
} from './market-blind-types';

const GENESIS_PREV_HASH = '0'.repeat(64);
const SEALED_RECEIPTS = new WeakSet<SealedForecastReceipt>();

function validateNonEmpty(label: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', `${label} must be non-empty`);
  }
  return trimmed;
}

function validateProbabilityOpen(label: string, p: number): void {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', `${label} must lie strictly inside (0, 1); got ${p}`);
  }
}

export function computeForecastEntryHash(payload: {
  modelVersionId: string;
  stateVariant: string;
  questionId: string;
  category: string;
  pRaw: number;
  loggedAtMs: number;
  contextHash: string;
  prevEntryHash: string;
}): string {
  const canonical = JSON.stringify([
    payload.modelVersionId,
    payload.stateVariant,
    payload.questionId,
    payload.category,
    Number(payload.pRaw.toFixed(12)),
    payload.loggedAtMs,
    payload.contextHash,
    payload.prevEntryHash,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

/** Verifies both runtime seal registration and deterministic SHA-256 entryHash integrity. */
export function verifySealedForecastReceipt(receipt: SealedForecastReceipt): void {
  if (!receipt || typeof receipt !== 'object' || !SEALED_RECEIPTS.has(receipt)) {
    throw new MarketBlindError(
      'UNSEALED_FORECAST_RECEIPT',
      'Market price cannot be combined with an uncommitted or forged forecast receipt',
    );
  }
  const expected = computeForecastEntryHash(receipt);
  if (receipt.entryHash !== expected) {
    throw new MarketBlindError('UNSEALED_FORECAST_RECEIPT', 'Forecast receipt SHA-256 hash mismatch');
  }
}

/** Commits a raw market-blind forecast and returns an immutable sealed receipt token. */
export function commitMarketBlindForecast(
  input: ProspectiveForecastInput,
  ledger?: MarketBlindProspectiveLedger,
): SealedForecastReceipt {
  if (ledger) return ledger.commitForecast(input);
  return buildSealedReceipt(input, GENESIS_PREV_HASH);
}

function buildSealedReceipt(input: ProspectiveForecastInput, prevEntryHash: string): SealedForecastReceipt {
  const modelVersionId = validateNonEmpty('modelVersionId', input.modelVersionId);
  const stateVariant = validateNonEmpty('stateVariant', input.stateVariant);
  const questionId = validateNonEmpty('questionId', input.questionId);
  const category = validateNonEmpty('category', input.category);
  validateProbabilityOpen('pRaw', input.pRaw);
  if (!Number.isFinite(input.loggedAtMs) || input.loggedAtMs <= 0) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'loggedAtMs must be a positive finite timestamp');
  }
  assertProspectiveCutoff({
    modelKnowledgeCutoffMs: input.modelKnowledgeCutoffMs,
    eventResolutionOrCutoffMs: input.eventResolutionOrCutoffMs,
  });
  const contextHash = input.contextHash?.trim() || 'UNSPECIFIED_CONTEXT';
  const entryHash = computeForecastEntryHash({
    modelVersionId, stateVariant, questionId, category,
    pRaw: input.pRaw, loggedAtMs: input.loggedAtMs, contextHash, prevEntryHash,
  });
  const receipt: SealedForecastReceipt = Object.freeze({
    modelVersionId, stateVariant, questionId, category,
    pRaw: input.pRaw, loggedAtMs: input.loggedAtMs,
    contextHash, prevEntryHash, entryHash,
  });
  SEALED_RECEIPTS.add(receipt);
  return receipt;
}

/** Append-only hash-chained prospective ledger with post-commit market observation guard. */
export class MarketBlindProspectiveLedger {
  private readonly committed: SealedForecastReceipt[] = [];
  private readonly byHash = new Map<string, SealedForecastReceipt>();
  private readonly resolved = new Map<string, ResolvedForecastSample>();

  commitForecast(input: ProspectiveForecastInput): SealedForecastReceipt {
    const prev = this.committed.length > 0
      ? this.committed[this.committed.length - 1]!.entryHash
      : GENESIS_PREV_HASH;
    const receipt = buildSealedReceipt(input, prev);
    this.committed.push(receipt);
    this.byHash.set(receipt.entryHash, receipt);
    return receipt;
  }

  /** Reads live market state ONLY after verifying `receipt` is committed to this ledger. */
  async readLiveMarketAfterCommit<T>(
    receipt: SealedForecastReceipt,
    reader: () => Promise<T> | T,
  ): Promise<T> {
    verifySealedForecastReceipt(receipt);
    if (!this.byHash.has(receipt.entryHash)) {
      throw new MarketBlindError('UNSEALED_FORECAST_RECEIPT', 'Receipt is not recorded in this prospective ledger');
    }
    return await reader();
  }

  recordResolution(params: {
    receipt: SealedForecastReceipt;
    marketPriceAtCommit: number;
    marketObservedAtMs: number;
    outcome: 0 | 1;
    resolvedAtMs: number;
  }): ResolvedForecastSample {
    verifySealedForecastReceipt(params.receipt);
    if (!this.byHash.has(params.receipt.entryHash)) {
      throw new MarketBlindError('UNSEALED_FORECAST_RECEIPT', 'Receipt is not recorded in this prospective ledger');
    }
    validateProbabilityOpen('marketPriceAtCommit', params.marketPriceAtCommit);
    if (params.marketObservedAtMs < params.receipt.loggedAtMs) {
      throw new MarketBlindError(
        'INVALID_MARKET_BLIND_INPUT',
        `Market price observed (${params.marketObservedAtMs}) before forecast commit (${params.receipt.loggedAtMs})`,
      );
    }
    if (params.resolvedAtMs < params.receipt.loggedAtMs) {
      throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'Resolution timestamp precedes forecast commit');
    }
    const sample: ResolvedForecastSample = Object.freeze({ ...params });
    this.resolved.set(params.receipt.entryHash, sample);
    return sample;
  }

  entries(): readonly SealedForecastReceipt[] {
    return [...this.committed];
  }

  resolvedSamples(category?: string): ResolvedForecastSample[] {
    const all = [...this.resolved.values()];
    return category === undefined ? all : all.filter((s) => s.receipt.category === category);
  }

  verifyChainIntegrity(): boolean {
    let expectedPrev = GENESIS_PREV_HASH;
    for (const entry of this.committed) {
      if (entry.prevEntryHash !== expectedPrev) return false;
      if (computeForecastEntryHash(entry) !== entry.entryHash) return false;
      expectedPrev = entry.entryHash;
    }
    return true;
  }
}
