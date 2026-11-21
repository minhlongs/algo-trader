/** Sealed prospective records, persisted before publishing any eligible in-memory state. */
import { createHash } from 'node:crypto';
import { createInMemoryAppendOnlyStore, MarketBlindJournal, MarketBlindIntegrityError, type MarketBlindAppendOnlyStore } from './market-blind-journal';
import { MarketBlindProspectiveLedger, verifySealedForecastReceipt } from './market-blind-prospective-ledger';
import { assertMarketBlindClean, sanitizeMarketBlindContext } from './market-blind-sanitizer';
import { MarketBlindError, type MarketBlindDocumentInput } from './market-blind-types';
import { commitPayloadSchema, storedCommitSchema, snapshotSchema, resolutionSchema, type CommitPayload, type ProspectiveCommitInput, type ProspectiveCommitReceipt, type PostCommitMarketSnapshotInput, type PostCommitMarketSnapshotRecord, type MarketBlindResolutionInput, type MarketBlindResolutionAuditRecord } from './market-blind-pipeline-contract';
export type * from './market-blind-pipeline-contract';
export { evaluateProspectiveOosReport } from './market-blind-oos-report';
const invalid = (message: string): never => { throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', message); };
const same = (a: object, b: object): boolean => JSON.stringify(a) === JSON.stringify(b);

export class ProspectivePipelineLedger {
  private readonly commits = new Map<string, ProspectiveCommitReceipt>();
  private readonly questions = new Map<string, ProspectiveCommitReceipt[]>();
  private readonly prices = new Map<string, PostCommitMarketSnapshotRecord>();
  private readonly outcomes = new Map<string, MarketBlindResolutionAuditRecord>();
  private inner = new MarketBlindProspectiveLedger();
  private readonly journal: MarketBlindJournal;
  get commitsByHash(): ReadonlyMap<string, ProspectiveCommitReceipt> { return new Map(this.commits); }
  get commitsByQuestion(): ReadonlyMap<string, readonly ProspectiveCommitReceipt[]> { return new Map([...this.questions].map(([q, values]) => [q, [...values]])); }
  get snapshots(): ReadonlyMap<string, PostCommitMarketSnapshotRecord> { return new Map(this.prices); }
  get resolutions(): ReadonlyMap<string, MarketBlindResolutionAuditRecord> { return new Map(this.outcomes); }
  constructor(store: MarketBlindAppendOnlyStore = createInMemoryAppendOnlyStore(), private readonly nowMs: () => number = Date.now) {
    this.journal = new MarketBlindJournal(store);
    try {
      for (const r of this.journal.records) {
        if (r.kind === 'FORECAST_COMMIT') {
          const { forecastEntryHash, forecastPrevEntryHash, ...p } = storedCommitSchema.parse(r.payload);
          const c = this.prepareCommit(p, this.inner);
          if (c.entryHash !== forecastEntryHash || c.prevChainHash !== forecastPrevEntryHash) throw new MarketBlindIntegrityError('Forecast seal mismatch');
          this.indexCommit(c);
        } else if (r.kind === 'MARKET_SNAPSHOT') {
          const s = this.validateSnapshot(snapshotSchema.parse(r.payload));
          if (this.prices.has(s.entryHash)) throw new MarketBlindIntegrityError('Duplicate persisted snapshot');
          this.prices.set(s.entryHash, Object.freeze(s));
        } else if (r.kind === 'RESOLUTION') {
          const resolution = this.validateResolution(resolutionSchema.parse(r.payload));
          if (this.outcomes.has(resolution.entryHash)) throw new MarketBlindIntegrityError('Duplicate persisted resolution');
          this.applyInnerResolution(this.inner, resolution);
          this.outcomes.set(resolution.entryHash, Object.freeze(resolution));
        } else throw new MarketBlindIntegrityError('Unknown prospective record kind');
      }
    } catch (error) { throw new MarketBlindIntegrityError(`Invalid prospective payload: ${error instanceof Error ? error.message : String(error)}`); }
  }
  static hydrateFromStore(store: MarketBlindAppendOnlyStore): ProspectivePipelineLedger { return new ProspectivePipelineLedger(store); }
  commit(input: CommitPayload): ProspectiveCommitReceipt {
    this.journal.assertHealthy();
    const p = commitPayloadSchema.parse({ ...input, recordedAtMs: this.nowMs() }), staged = this.cloneInner(), receipt = this.prepareCommit(p, staged);
    this.journal.append('FORECAST_COMMIT', { ...p, forecastId: receipt.forecastId, forecastEntryHash: receipt.entryHash, forecastPrevEntryHash: receipt.prevChainHash });
    this.inner = staged; this.indexCommit(receipt); return receipt;
  }
  snapshot(input: PostCommitMarketSnapshotRecord): PostCommitMarketSnapshotRecord {
    this.journal.assertHealthy();
    const s = this.validateSnapshot(snapshotSchema.parse(input)), existing = this.prices.get(s.entryHash);
    if (existing) { if (!same(existing, s)) invalid('Conflicting market snapshot'); return existing; }
    this.journal.append('MARKET_SNAPSHOT', s);
    const frozen = Object.freeze(s); this.prices.set(s.entryHash, frozen); return frozen;
  }
  resolve(input: MarketBlindResolutionAuditRecord): MarketBlindResolutionAuditRecord {
    this.journal.assertHealthy();
    const r = this.validateResolution(resolutionSchema.parse(input)), existing = this.outcomes.get(r.entryHash);
    if (existing) { if (!same(existing, r)) invalid('Conflicting duplicate resolution'); return existing; }
    const staged = this.cloneInner(); this.applyInnerResolution(staged, r);
    this.journal.append('RESOLUTION', r);
    this.inner = staged;
    const frozen = Object.freeze(r); this.outcomes.set(r.entryHash, frozen); return frozen;
  }
  recordCount(): number { return this.journal.recordCount(); }
  verifyChainIntegrity(): boolean { return this.journal.verify() && this.inner.verifyChainIntegrity(); }
  integrityVerified(): boolean { return this.journal.integrityVerified() && this.inner.verifyChainIntegrity(); }
  hasHindcastViolation(): boolean { return false; }
  private prepareCommit(p: CommitPayload, inner: MarketBlindProspectiveLedger): ProspectiveCommitReceipt {
    const forecastId = p.forecastId ?? createHash('sha256').update(JSON.stringify([p, inner.entries().at(-1)?.entryHash ?? 'GENESIS'])).digest('hex');
    if ([...this.commits.values()].some((c) => c.forecastId === forecastId)) invalid('Duplicate forecastId');
    const s = inner.commitForecast({ modelVersionId: p.modelVersion, stateVariant: p.promptVersion, questionId: p.questionId, category: p.category, pRaw: p.pRaw, loggedAtMs: p.committedAtMs, contextHash: p.contextHash });
    return Object.freeze({ ...p, forecastId, provenance: p.provenance ? Object.freeze({ ...p.provenance }) : undefined,
      entryHash: s.entryHash, prevChainHash: s.prevEntryHash, sealedReceipt: s });
  }
  private indexCommit(c: ProspectiveCommitReceipt): void {
    this.commits.set(c.entryHash, c); this.questions.set(c.questionId, [...(this.questions.get(c.questionId) ?? []), c]);
  }
  private cloneInner(): MarketBlindProspectiveLedger {
    const staged = new MarketBlindProspectiveLedger();
    for (const c of this.inner.entries()) staged.commitForecast(c);
    for (const sample of this.inner.resolvedSamples()) staged.recordResolution(sample);
    return staged;
  }
  private validateSnapshot(s: PostCommitMarketSnapshotRecord): PostCommitMarketSnapshotRecord {
    const c = this.commits.get(s.entryHash);
    if (!c) throw new MarketBlindError('UNSEALED_FORECAST_RECEIPT', 'Unknown committed forecast');
    if (s.marketReadAtMs < c.committedAtMs) throw new MarketBlindError('HINDCAST_CONTAMINATION_BLOCKED', 'Snapshot precedes commitment');
    if (this.outcomes.has(s.entryHash)) invalid('Cannot attach a snapshot after resolution');
    return s;
  }
  private validateResolution(r: MarketBlindResolutionAuditRecord): MarketBlindResolutionAuditRecord {
    const c = this.commits.get(r.entryHash);
    if (!c) throw new MarketBlindError('UNSEALED_FORECAST_RECEIPT', 'Unknown committed forecast');
    const expected = r.status === 'RESOLVED_YES' ? 1 : r.status === 'RESOLVED_NO' ? 0 : null;
    if (r.questionId !== c.questionId || r.outcome !== expected) invalid('Resolution question/status/outcome mismatch');
    if (r.resolvedAtMs <= c.committedAtMs || (r.marketReadAtMs !== null && (r.marketReadAtMs < c.committedAtMs || r.marketReadAtMs >= r.resolvedAtMs))) {
      throw new MarketBlindError('HINDCAST_CONTAMINATION_BLOCKED', 'Resolution or snapshot is not prospective');
    }
    if (expected !== null && (r.marketProb === null || r.marketReadAtMs === null)) invalid('Post-commit market snapshot required');
    const s = this.prices.get(c.entryHash);
    if (s && (r.marketProb !== s.marketProb || r.marketReadAtMs !== s.marketReadAtMs)) invalid('Resolution conflicts with committed market snapshot');
    return r;
  }
  private applyInnerResolution(inner: MarketBlindProspectiveLedger, r: MarketBlindResolutionAuditRecord): void {
    if (r.outcome === null || r.marketProb === null || r.marketReadAtMs === null) return;
    inner.recordResolution({ receipt: this.commits.get(r.entryHash)!.sealedReceipt, marketPriceAtCommit: r.marketProb,
      marketObservedAtMs: r.marketReadAtMs, outcome: r.outcome, resolvedAtMs: r.resolvedAtMs });
  }
}

export function submitMarketBlindForecast(ledger: ProspectivePipelineLedger, input: ProspectiveCommitInput): ProspectiveCommitReceipt {
  if (input.prompt) assertMarketBlindClean(input.prompt);
  const docs: MarketBlindDocumentInput[] = typeof input.evidence === 'string' ? [{ id: 'evidence-0', title: input.prompt ?? 'evidence', content: input.evidence }] : [...input.evidence];
  for (const doc of docs) assertMarketBlindClean(JSON.stringify(doc));
  const sanitized = sanitizeMarketBlindContext({ documents: docs, eventResolutionOrCutoffMs: input.eventResolutionOrCutoffMs }, { ...input.sanitizerConfig, modelKnowledgeCutoffMs: input.modelKnowledgeCutoffMs ?? input.sanitizerConfig?.modelKnowledgeCutoffMs });
  return ledger.commit({ questionId: input.questionId, category: input.category ?? 'general', pRaw: input.pRaw, modelVersion: input.modelVersion,
    promptVersion: input.promptVersion ?? 'v1', committedAtMs: input.committedAtMs ?? Date.now(), contextHash: sanitized.contextHash,
    forecastId: input.forecastId, researchQuestionId: input.researchQuestionId, eventId: input.eventId, marketId: input.marketId,
    forecastHorizonMs: input.forecastHorizonMs, provenance: input.provenance });
}
export function attachPostCommitMarketSnapshot(ledger: ProspectivePipelineLedger, receiptOrHash: ProspectiveCommitReceipt | string, snap: PostCommitMarketSnapshotInput): PostCommitMarketSnapshotRecord {
  if (typeof receiptOrHash !== 'string') verifySealedForecastReceipt(receiptOrHash.sealedReceipt);
  return ledger.snapshot({ entryHash: typeof receiptOrHash === 'string' ? receiptOrHash : receiptOrHash.entryHash,
    marketProb: snap.marketProb, marketReadAtMs: snap.marketReadAtMs ?? Date.now(), source: snap.source ?? 'polymarket-live' });
}
export function recordMarketBlindResolution(ledger: ProspectivePipelineLedger, input: MarketBlindResolutionInput): MarketBlindResolutionAuditRecord[] {
  const targets = input.entryHash ? (ledger.commitsByHash.has(input.entryHash) ? [ledger.commitsByHash.get(input.entryHash)!] : [])
    : input.questionId ? ledger.commitsByQuestion.get(input.questionId) ?? [] : [];
  if (!targets.length) throw new MarketBlindError('UNSEALED_FORECAST_RECEIPT', 'No committed forecast matched target');
  const resolvedAtMs = input.resolvedAtMs ?? Date.now();
  return targets.map((c) => {
    if (input.questionId && input.questionId !== c.questionId) invalid('Resolution target mismatch');
    const s = ledger.snapshots.get(c.entryHash);
    return ledger.resolve({ entryHash: c.entryHash, questionId: c.questionId, status: input.status,
      outcome: input.status === 'RESOLVED_YES' ? 1 : input.status === 'RESOLVED_NO' ? 0 : null, resolvedAtMs,
      marketProb: input.marketProb ?? s?.marketProb ?? null, marketReadAtMs: input.marketReadAtMs ?? s?.marketReadAtMs ?? null,
      ...(input.note !== undefined ? { note: input.note } : {}) });
  });
}
