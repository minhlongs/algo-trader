/** Worker-safe storage ports and compatibility durable ledger; no filesystem imports. */
import { MarketBlindJournal, MarketBlindIntegrityError, type MarketBlindAppendOnlyStore } from './market-blind-journal';
import { MarketBlindProspectiveLedger, verifySealedForecastReceipt } from './market-blind-prospective-ledger';
import type { ProspectiveForecastInput, ResolvedForecastSample, SealedForecastReceipt } from './market-blind-types';
export { MarketBlindIntegrityError, createInMemoryAppendOnlyStore } from './market-blind-journal';
export type { MarketBlindAppendOnlyStore, MarketBlindCheckpoint, MarketBlindCheckpointStore } from './market-blind-journal';
export type MarketBlindLedgerRecordKind = 'FORECAST_COMMIT' | 'MARKET_READ_AFTER_COMMIT' | 'RESOLUTION';
interface ForecastCommitPayload { input: ProspectiveForecastInput; forecastEntryHash: string; forecastPrevEntryHash: string; }
interface MarketReadPayload { forecastEntryHash: string; observedAtMs: number; }
interface ResolutionPayload { forecastEntryHash: string; marketPriceAtCommit: number; marketObservedAtMs: number; outcome: 0 | 1; resolvedAtMs: number; }
type ResolutionParams = Omit<ResolutionPayload, 'forecastEntryHash'> & { receipt: SealedForecastReceipt };
export interface MarketBlindLedgerRecord {
  seq: number; kind: MarketBlindLedgerRecordKind; prevHash: string; entryHash: string;
  payload: ForecastCommitPayload | MarketReadPayload | ResolutionPayload;
}
export class DurableMarketBlindLedger {
  private inner = new MarketBlindProspectiveLedger();
  private readonly receipts = new Map<string, SealedForecastReceipt>();
  private readonly resolved = new Map<string, ResolvedForecastSample>();
  private readonly journal: MarketBlindJournal;
  private busy = false;
  constructor(store: MarketBlindAppendOnlyStore) {
    this.journal = new MarketBlindJournal(store);
    try {
      for (const rec of this.journal.records) {
        if (rec.kind === 'FORECAST_COMMIT') {
          const p = rec.payload as ForecastCommitPayload, receipt = this.inner.commitForecast(p.input);
          if (receipt.entryHash !== p.forecastEntryHash || receipt.prevEntryHash !== p.forecastPrevEntryHash) throw new MarketBlindIntegrityError('Forecast seal mismatch');
          this.receipts.set(receipt.entryHash, receipt);
        } else if (rec.kind === 'MARKET_READ_AFTER_COMMIT') {
          const p = rec.payload as MarketReadPayload;
          this.validateRead(this.requireReceipt(p.forecastEntryHash), p.observedAtMs);
        } else if (rec.kind === 'RESOLUTION') {
          const p = rec.payload as ResolutionPayload;
          if (this.resolved.has(p.forecastEntryHash)) throw new MarketBlindIntegrityError('Duplicate persisted resolution');
          const sample = this.inner.recordResolution({ receipt: this.requireReceipt(p.forecastEntryHash), marketPriceAtCommit: p.marketPriceAtCommit,
            marketObservedAtMs: p.marketObservedAtMs, outcome: p.outcome, resolvedAtMs: p.resolvedAtMs });
          this.resolved.set(p.forecastEntryHash, sample);
        } else throw new MarketBlindIntegrityError('Unknown durable record kind');
      }
    } catch (error) { throw new MarketBlindIntegrityError(`Invalid durable payload: ${error instanceof Error ? error.message : String(error)}`); }
  }
  static hydrateFromStore(store: MarketBlindAppendOnlyStore): DurableMarketBlindLedger { return new DurableMarketBlindLedger(store); }
  commitForecast(input: ProspectiveForecastInput): SealedForecastReceipt {
    this.assertAvailable();
    const staged = this.cloneInner(), receipt = staged.commitForecast(input);
    this.journal.append('FORECAST_COMMIT', { input: { ...input }, forecastEntryHash: receipt.entryHash, forecastPrevEntryHash: receipt.prevEntryHash });
    this.inner = staged; this.receipts.set(receipt.entryHash, receipt); return receipt;
  }
  async readLiveMarketAfterCommit<T>(receipt: SealedForecastReceipt, reader: () => Promise<T> | T, observedAtMs = Math.max(Date.now(), receipt.loggedAtMs)): Promise<T> {
    this.assertAvailable(); this.validateRead(receipt, observedAtMs); this.busy = true;
    try {
      const result = await this.inner.readLiveMarketAfterCommit(receipt, reader);
      this.journal.append('MARKET_READ_AFTER_COMMIT', { forecastEntryHash: receipt.entryHash, observedAtMs });
      return result;
    } finally { this.busy = false; }
  }
  recordResolution(params: ResolutionParams): ResolvedForecastSample {
    this.assertAvailable(); verifySealedForecastReceipt(params.receipt); this.requireReceipt(params.receipt.entryHash);
    const existing = this.resolved.get(params.receipt.entryHash);
    if (existing) {
      if (existing.marketPriceAtCommit !== params.marketPriceAtCommit || existing.marketObservedAtMs !== params.marketObservedAtMs
        || existing.outcome !== params.outcome || existing.resolvedAtMs !== params.resolvedAtMs) throw new MarketBlindIntegrityError('Conflicting duplicate resolution');
      return existing;
    }
    const staged = this.cloneInner(), sample = staged.recordResolution(params);
    this.journal.append('RESOLUTION', { forecastEntryHash: params.receipt.entryHash, marketPriceAtCommit: params.marketPriceAtCommit,
      marketObservedAtMs: params.marketObservedAtMs, outcome: params.outcome, resolvedAtMs: params.resolvedAtMs });
    this.inner = staged; this.resolved.set(params.receipt.entryHash, sample); return sample;
  }
  entries(): readonly SealedForecastReceipt[] { return [...this.receipts.values()]; }
  resolvedSamples(category?: string): ResolvedForecastSample[] { return [...this.resolved.values()].filter((s) => !category || s.receipt.category === category); }
  getReceiptByHash(entryHash: string): SealedForecastReceipt | undefined { return this.receipts.get(entryHash); }
  getReceiptsByQuestionId(questionId: string): SealedForecastReceipt[] { return [...this.receipts.values()].filter((r) => r.questionId === questionId); }
  isResolved(entryHash: string): boolean { return this.resolved.has(entryHash); }
  recordCount(): number { return this.journal.recordCount(); }
  verifyChainIntegrity(): boolean { return this.journal.verify() && this.inner.verifyChainIntegrity(); }
  integrityVerified(): boolean { return this.journal.integrityVerified() && this.inner.verifyChainIntegrity(); }
  private assertAvailable(): void {
    this.journal.assertHealthy();
    if (this.busy) throw new MarketBlindIntegrityError('Concurrent async mutation unsupported');
  }
  private requireReceipt(hash: string): SealedForecastReceipt {
    const receipt = this.receipts.get(hash);
    if (!receipt) throw new MarketBlindIntegrityError('Unknown committed forecast');
    return receipt;
  }
  private validateRead(receipt: SealedForecastReceipt, observedAtMs: number): void {
    verifySealedForecastReceipt(receipt); this.requireReceipt(receipt.entryHash);
    if (!Number.isFinite(observedAtMs) || observedAtMs < receipt.loggedAtMs) throw new MarketBlindIntegrityError('Market read precedes commitment');
  }
  private cloneInner(): MarketBlindProspectiveLedger {
    const staged = new MarketBlindProspectiveLedger();
    for (const r of this.inner.entries()) staged.commitForecast(r);
    for (const sample of this.resolved.values()) staged.recordResolution(sample);
    return staged;
  }
}
