/**
 * Durable Append-Only Market-Blind Prospective Ledger (Cloudflare Worker Safe).
 *
 * Persists canonical JSONL records (`FORECAST_COMMIT`, `MARKET_READ_AFTER_COMMIT`,
 * `RESOLUTION`) linked by a contiguous SHA-256 hash chain (`seq`, `prevHash` -> `entryHash`).
 * Pure storage port with zero filesystem imports; inject an adapter at composition root.
 */

import { createHash } from 'node:crypto';
import { MarketBlindProspectiveLedger } from './market-blind-prospective-ledger';
import type {
  ProspectiveForecastInput,
  ResolvedForecastSample,
  SealedForecastReceipt,
} from './market-blind-types';

const GENESIS_CHAIN_HASH = '0'.repeat(64);

export interface MarketBlindAppendOnlyStore {
  appendLine(line: string): void;
  readAllLines(): string[];
}

export class MarketBlindIntegrityError extends Error {
  constructor(message: string) {
    super(`MARKET_BLIND_INTEGRITY_ERROR: ${message}`);
    this.name = 'MarketBlindIntegrityError';
  }
}

export type MarketBlindLedgerRecordKind = 'FORECAST_COMMIT' | 'MARKET_READ_AFTER_COMMIT' | 'RESOLUTION';

interface ForecastCommitPayload { input: ProspectiveForecastInput; forecastEntryHash: string; forecastPrevEntryHash: string; }
interface MarketReadPayload { forecastEntryHash: string; observedAtMs: number; }
interface ResolutionPayload {
  forecastEntryHash: string; marketPriceAtCommit: number;
  marketObservedAtMs: number; outcome: 0 | 1; resolvedAtMs: number;
}
type LedgerRecordPayload = ForecastCommitPayload | MarketReadPayload | ResolutionPayload;

export interface MarketBlindLedgerRecord {
  seq: number; kind: MarketBlindLedgerRecordKind; prevHash: string; entryHash: string; payload: LedgerRecordPayload;
}

function computeRecordHash(seq: number, kind: MarketBlindLedgerRecordKind, prevHash: string, payload: LedgerRecordPayload): string {
  return createHash('sha256').update(JSON.stringify([seq, kind, prevHash, payload])).digest('hex');
}

/** Pure in-memory append-only store for tests and Worker sandboxes. */
export function createInMemoryAppendOnlyStore(): MarketBlindAppendOnlyStore {
  const lines: string[] = [];
  return {
    appendLine(line: string): void { lines.push(line); },
    readAllLines(): string[] { return [...lines]; },
  };
}

export class DurableMarketBlindLedger {
  private readonly inner = new MarketBlindProspectiveLedger();
  private readonly receiptsByHash = new Map<string, SealedForecastReceipt>();
  private readonly receiptsByQuestion = new Map<string, SealedForecastReceipt[]>();
  private readonly resolvedHashes = new Set<string>();
  private nextSeq = 0;
  private lastChainHash = GENESIS_CHAIN_HASH;

  constructor(private readonly store: MarketBlindAppendOnlyStore) {}

  static hydrateFromStore(store: MarketBlindAppendOnlyStore): DurableMarketBlindLedger {
    const durable = new DurableMarketBlindLedger(store);
    const lines = store.readAllLines();
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i]!;
      if (raw.trim().length === 0) throw new MarketBlindIntegrityError(`Empty or truncated line at index ${i}`);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch {
        throw new MarketBlindIntegrityError(`Malformed JSONL record at line ${i}`);
      }
      durable.replayRecord(parsed, i);
    }
    if (!durable.inner.verifyChainIntegrity()) {
      throw new MarketBlindIntegrityError('Inner prospective forecast hash chain verification failed');
    }
    return durable;
  }

  commitForecast(input: ProspectiveForecastInput): SealedForecastReceipt {
    const receipt = this.inner.commitForecast(input);
    this.appendRecord('FORECAST_COMMIT', {
      input: { ...input },
      forecastEntryHash: receipt.entryHash,
      forecastPrevEntryHash: receipt.prevEntryHash,
    });
    this.indexReceipt(receipt);
    return receipt;
  }

  async readLiveMarketAfterCommit<T>(
    receipt: SealedForecastReceipt,
    reader: () => Promise<T> | T,
    observedAtMs: number = Math.max(Date.now(), receipt.loggedAtMs),
  ): Promise<T> {
    if (!Number.isFinite(observedAtMs) || observedAtMs < receipt.loggedAtMs) {
      throw new MarketBlindIntegrityError(`Market read (${observedAtMs}) precedes commit (${receipt.loggedAtMs})`);
    }
    const result = await this.inner.readLiveMarketAfterCommit(receipt, reader);
    this.appendRecord('MARKET_READ_AFTER_COMMIT', { forecastEntryHash: receipt.entryHash, observedAtMs });
    return result;
  }

  recordResolution(params: {
    receipt: SealedForecastReceipt; marketPriceAtCommit: number;
    marketObservedAtMs: number; outcome: 0 | 1; resolvedAtMs: number;
  }): ResolvedForecastSample {
    const sample = this.inner.recordResolution(params);
    this.appendRecord('RESOLUTION', {
      forecastEntryHash: params.receipt.entryHash, marketPriceAtCommit: params.marketPriceAtCommit,
      marketObservedAtMs: params.marketObservedAtMs, outcome: params.outcome, resolvedAtMs: params.resolvedAtMs,
    });
    this.resolvedHashes.add(params.receipt.entryHash);
    return sample;
  }

  entries(): readonly SealedForecastReceipt[] { return this.inner.entries(); }
  resolvedSamples(category?: string): ResolvedForecastSample[] { return this.inner.resolvedSamples(category); }
  getReceiptByHash(entryHash: string): SealedForecastReceipt | undefined { return this.receiptsByHash.get(entryHash); }
  getReceiptsByQuestionId(questionId: string): SealedForecastReceipt[] { return [...(this.receiptsByQuestion.get(questionId) ?? [])]; }
  isResolved(entryHash: string): boolean { return this.resolvedHashes.has(entryHash); }
  recordCount(): number { return this.nextSeq; }
  verifyChainIntegrity(): boolean { return this.inner.verifyChainIntegrity(); }

  private appendRecord(kind: MarketBlindLedgerRecordKind, payload: LedgerRecordPayload): void {
    const seq = this.nextSeq;
    const prevHash = this.lastChainHash;
    const entryHash = computeRecordHash(seq, kind, prevHash, payload);
    this.store.appendLine(JSON.stringify({ seq, kind, prevHash, entryHash, payload } satisfies MarketBlindLedgerRecord));
    this.nextSeq += 1;
    this.lastChainHash = entryHash;
  }

  private indexReceipt(receipt: SealedForecastReceipt): void {
    this.receiptsByHash.set(receipt.entryHash, receipt);
    const list = this.receiptsByQuestion.get(receipt.questionId) ?? [];
    list.push(receipt);
    this.receiptsByQuestion.set(receipt.questionId, list);
  }

  private replayRecord(raw: unknown, lineIndex: number): void {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MarketBlindIntegrityError(`Invalid record at line ${lineIndex}`);
    const rec = raw as Partial<MarketBlindLedgerRecord>;
    if (rec.seq !== this.nextSeq) throw new MarketBlindIntegrityError(`Out-of-order seq at line ${lineIndex}`);
    if (rec.prevHash !== this.lastChainHash) throw new MarketBlindIntegrityError(`Broken prevHash at line ${lineIndex}`);
    if (rec.kind !== 'FORECAST_COMMIT' && rec.kind !== 'MARKET_READ_AFTER_COMMIT' && rec.kind !== 'RESOLUTION') {
      throw new MarketBlindIntegrityError(`Unknown record kind at line ${lineIndex}`);
    }
    if (rec.entryHash !== computeRecordHash(rec.seq, rec.kind, rec.prevHash, rec.payload as LedgerRecordPayload)) {
      throw new MarketBlindIntegrityError(`Tampered entryHash at line ${lineIndex}`);
    }
    this.applyReplayedPayload(rec.kind, rec.payload as LedgerRecordPayload, lineIndex);
    this.nextSeq += 1;
    this.lastChainHash = rec.entryHash;
  }

  private applyReplayedPayload(kind: MarketBlindLedgerRecordKind, payload: LedgerRecordPayload, lineIndex: number): void {
    if (kind === 'FORECAST_COMMIT') {
      const p = payload as ForecastCommitPayload;
      const receipt = this.inner.commitForecast(p.input);
      if (receipt.entryHash !== p.forecastEntryHash || receipt.prevEntryHash !== p.forecastPrevEntryHash) {
        throw new MarketBlindIntegrityError(`Forecast hash mismatch on replay at line ${lineIndex}`);
      }
      this.indexReceipt(receipt);
      return;
    }
    const receipt = this.receiptsByHash.get((payload as MarketReadPayload | ResolutionPayload).forecastEntryHash);
    if (!receipt) throw new MarketBlindIntegrityError(`Unknown/uncommitted forecast referenced at line ${lineIndex}`);
    if (kind === 'MARKET_READ_AFTER_COMMIT') {
      const p = payload as MarketReadPayload;
      if (!Number.isFinite(p.observedAtMs) || p.observedAtMs < receipt.loggedAtMs) {
        throw new MarketBlindIntegrityError(`Out-of-order market read before commit at line ${lineIndex}`);
      }
      return;
    }
    const p = payload as ResolutionPayload;
    this.inner.recordResolution({
      receipt, marketPriceAtCommit: p.marketPriceAtCommit,
      marketObservedAtMs: p.marketObservedAtMs, outcome: p.outcome, resolvedAtMs: p.resolvedAtMs,
    });
    this.resolvedHashes.add(receipt.entryHash);
  }
}
