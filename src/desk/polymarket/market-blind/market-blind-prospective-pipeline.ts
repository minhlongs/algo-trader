/**
 * Prospective Market-Blind Forecast Pipeline (Worker-safe — zero filesystem imports).
 * Enforces seal-before-price ordering, SHA-256 JSONL chain integrity,
 * non-binary resolution auditing, and `w_skill = 0` lock until >= 150 OOS forecasts.
 */
import { createHash } from 'node:crypto';
import { evaluateCalibrationMetrics } from './market-blind-calibrator';
import { MarketBlindIntegrityError, createInMemoryAppendOnlyStore, type MarketBlindAppendOnlyStore } from './market-blind-ledger-store';
import { MarketBlindProspectiveLedger, verifySealedForecastReceipt } from './market-blind-prospective-ledger';
import { assertMarketBlindClean, sanitizeMarketBlindContext } from './market-blind-sanitizer';
import { evaluateSkillGate } from './market-blind-shrunk-posterior';
import {
  DEFAULT_POSTERIOR_CONFIG, MarketBlindError, type MarketBlindDocumentInput, type MarketBlindPosteriorConfig,
  type MarketBlindSanitizerConfig, type OosEvaluationRecord, type SealedForecastReceipt, type SkillGateFailureReason,
} from './market-blind-types';

const GENESIS_HASH = '0'.repeat(64);
const RESOLUTION_STATES = new Set<MarketBlindResolutionState>(['RESOLVED_YES', 'RESOLVED_NO', 'VOIDED', 'CANCELLED', 'UMA_DISPUTED']);

export type MarketBlindResolutionState = 'RESOLVED_YES' | 'RESOLVED_NO' | 'VOIDED' | 'CANCELLED' | 'UMA_DISPUTED';
export type ProspectiveOosVerdict = 'INSUFFICIENT_DATA' | 'FAIL_CALIBRATION' | 'PASS_PROSPECTIVE_SKILL';
export interface ProspectiveCommitInput {
  questionId: string; category?: string; pRaw: number; modelVersion: string; promptVersion?: string; prompt?: string;
  evidence: string | readonly MarketBlindDocumentInput[]; committedAtMs?: number;
  modelKnowledgeCutoffMs?: number; eventResolutionOrCutoffMs?: number; sanitizerConfig?: Partial<MarketBlindSanitizerConfig>;
}
export interface ProspectiveCommitReceipt {
  readonly entryHash: string; readonly prevChainHash: string; readonly committedAtMs: number; readonly modelVersion: string;
  readonly promptVersion: string; readonly questionId: string; readonly category: string; readonly pRaw: number;
  readonly contextHash: string; readonly sealedReceipt: SealedForecastReceipt;
}
export interface PostCommitMarketSnapshotInput { marketProb: number; marketReadAtMs?: number; source?: string; }
export interface PostCommitMarketSnapshotRecord { readonly entryHash: string; readonly marketProb: number; readonly marketReadAtMs: number; readonly source: string; }
export interface MarketBlindResolutionInput {
  questionId?: string; entryHash?: string; status: MarketBlindResolutionState; resolvedAtMs?: number; marketProb?: number; marketReadAtMs?: number; note?: string;
}
export interface MarketBlindResolutionAuditRecord {
  readonly entryHash: string; readonly questionId: string; readonly status: MarketBlindResolutionState; readonly outcome: 0 | 1 | null;
  readonly resolvedAtMs: number; readonly marketProb: number | null; readonly marketReadAtMs: number | null; readonly note?: string;
}
export interface ProspectiveOosReportOptions { category?: string; calibrate?: (pRaw: number) => number; config?: Partial<MarketBlindPosteriorConfig>; }
export interface ProspectiveOosReport {
  committedCount: number; resolvedScoredCount: number; voidedCount: number; cancelledCount: number; umaDisputedCount: number; pendingCount: number;
  brierModel: number | null; brierMarket: number | null; bssOos: number | null; bssLower95: number | null; ece: number | null;
  rolling100ModelBrier: number | null; rolling100MarketBrier: number | null;
  skillGate: { wSkill: number; unlocked: boolean; reasons: SkillGateFailureReason[] };
  verdict: ProspectiveOosVerdict; chainVerified: boolean; hindcastDetected: boolean;
}

type PipelineRecordKind = 'FORECAST_COMMIT' | 'MARKET_SNAPSHOT' | 'RESOLUTION';
interface CommitPayload {
  questionId: string; category: string; pRaw: number; modelVersion: string; promptVersion: string;
  committedAtMs: number; contextHash: string; forecastEntryHash: string; forecastPrevEntryHash: string;
}
type PipelinePayload = CommitPayload | PostCommitMarketSnapshotRecord | MarketBlindResolutionAuditRecord;
interface PipelineLedgerRecord { seq: number; kind: PipelineRecordKind; prevHash: string; entryHash: string; payload: PipelinePayload; }

const sha256Record = (seq: number, kind: PipelineRecordKind, prevHash: string, payload: PipelinePayload): string => createHash('sha256').update(JSON.stringify([seq, kind, prevHash, payload])).digest('hex');
const numOrNull = (n: number, v: number): number | null => (n > 0 && Number.isFinite(v) ? v : null);
const assertOpenProb = (label: string, p: number): void => { if (!Number.isFinite(p) || p <= 0 || p >= 1) throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', `${label} must be in (0, 1); got ${p}`); };

export class ProspectivePipelineLedger {
  readonly commitsByHash = new Map<string, ProspectiveCommitReceipt>();
  readonly commitsByQuestion = new Map<string, ProspectiveCommitReceipt[]>();
  readonly snapshots = new Map<string, PostCommitMarketSnapshotRecord>();
  readonly resolutions = new Map<string, MarketBlindResolutionAuditRecord>();
  private readonly inner = new MarketBlindProspectiveLedger();
  private nextSeq = 0; private lastChainHash = GENESIS_HASH; private hindcastFlag = false;
  constructor(private readonly store: MarketBlindAppendOnlyStore = createInMemoryAppendOnlyStore()) {}
  static hydrateFromStore(store: MarketBlindAppendOnlyStore): ProspectivePipelineLedger {
    const ledger = new ProspectivePipelineLedger(store), lines = store.readAllLines();
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i]!;
      if (raw.trim().length === 0) throw new MarketBlindIntegrityError(`Empty or truncated line at index ${i}`);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new MarketBlindIntegrityError(`Malformed JSONL at line ${i}`); }
      ledger.replay(parsed, i);
    }
    if (!ledger.verifyChainIntegrity()) throw new MarketBlindIntegrityError('Inner hash chain verification failed');
    return ledger;
  }
  commit(p: Omit<CommitPayload, 'forecastEntryHash' | 'forecastPrevEntryHash'>): ProspectiveCommitReceipt { const rec = this.applyCommit(p); this.persist('FORECAST_COMMIT', { ...p, forecastEntryHash: rec.entryHash, forecastPrevEntryHash: rec.prevChainHash }); return rec; }
  snapshot(s: PostCommitMarketSnapshotRecord): PostCommitMarketSnapshotRecord { const f = Object.freeze({ ...s }); this.persist('MARKET_SNAPSHOT', f); this.snapshots.set(f.entryHash, f); return f; }
  resolve(r: MarketBlindResolutionAuditRecord): MarketBlindResolutionAuditRecord { const f = this.applyResolution(r); this.persist('RESOLUTION', f); return f; }
  recordCount(): number { return this.nextSeq; }
  verifyChainIntegrity(): boolean { return this.inner.verifyChainIntegrity(); }
  hasHindcastViolation(): boolean { return this.hindcastFlag; }

  private applyCommit(p: Omit<CommitPayload, 'forecastEntryHash' | 'forecastPrevEntryHash'>): ProspectiveCommitReceipt {
    const s = this.inner.commitForecast({ modelVersionId: p.modelVersion, stateVariant: p.promptVersion, questionId: p.questionId, category: p.category, pRaw: p.pRaw, loggedAtMs: p.committedAtMs, contextHash: p.contextHash });
    const rec: ProspectiveCommitReceipt = Object.freeze({
      entryHash: s.entryHash, prevChainHash: s.prevEntryHash, committedAtMs: s.loggedAtMs, modelVersion: s.modelVersionId,
      promptVersion: s.stateVariant, questionId: s.questionId, category: s.category, pRaw: s.pRaw, contextHash: s.contextHash, sealedReceipt: s,
    });
    this.commitsByHash.set(rec.entryHash, rec);
    this.commitsByQuestion.set(rec.questionId, [...(this.commitsByQuestion.get(rec.questionId) ?? []), rec]);
    return rec;
  }
  private applyResolution(r: MarketBlindResolutionAuditRecord): MarketBlindResolutionAuditRecord {
    const c = this.commitsByHash.get(r.entryHash);
    if (!c) throw new MarketBlindError('UNSEALED_FORECAST_RECEIPT', `Unknown forecast hash: ${r.entryHash}`);
    if (r.outcome !== null && r.marketProb !== null && r.marketReadAtMs !== null) {
      this.inner.recordResolution({ receipt: c.sealedReceipt, marketPriceAtCommit: r.marketProb, marketObservedAtMs: r.marketReadAtMs, outcome: r.outcome, resolvedAtMs: r.resolvedAtMs });
    }
    const frozen = Object.freeze({ ...r }); this.resolutions.set(frozen.entryHash, frozen); return frozen;
  }
  private persist(kind: PipelineRecordKind, payload: PipelinePayload): void {
    const seq = this.nextSeq, prevHash = this.lastChainHash, entryHash = sha256Record(seq, kind, prevHash, payload);
    this.store.appendLine(JSON.stringify({ seq, kind, prevHash, entryHash, payload } satisfies PipelineLedgerRecord));
    this.nextSeq += 1; this.lastChainHash = entryHash;
  }
  private replay(raw: unknown, i: number): void {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MarketBlindIntegrityError(`Invalid record at line ${i}`);
    const rec = raw as Partial<PipelineLedgerRecord>;
    if (rec.seq !== this.nextSeq || rec.prevHash !== this.lastChainHash) throw new MarketBlindIntegrityError(`Chain sequence/prevHash mismatch at line ${i}`);
    if (rec.kind !== 'FORECAST_COMMIT' && rec.kind !== 'MARKET_SNAPSHOT' && rec.kind !== 'RESOLUTION') throw new MarketBlindIntegrityError(`Unknown kind at line ${i}`);
    if (rec.entryHash !== sha256Record(rec.seq, rec.kind, rec.prevHash, rec.payload as PipelinePayload)) throw new MarketBlindIntegrityError(`Tampered entryHash at line ${i}`);
    if (rec.kind === 'FORECAST_COMMIT') {
      const p = rec.payload as CommitPayload, c = this.applyCommit(p);
      if (c.entryHash !== p.forecastEntryHash || c.prevChainHash !== p.forecastPrevEntryHash) throw new MarketBlindIntegrityError(`Forecast hash mismatch at line ${i}`);
    } else if (rec.kind === 'MARKET_SNAPSHOT') {
      const s = rec.payload as PostCommitMarketSnapshotRecord, c = this.commitsByHash.get(s.entryHash);
      if (!c || !Number.isFinite(s.marketReadAtMs) || s.marketReadAtMs < c.committedAtMs) { this.hindcastFlag = true; throw new MarketBlindIntegrityError(`Invalid/pre-commit snapshot at line ${i}`); }
      this.snapshots.set(s.entryHash, Object.freeze({ ...s }));
    } else {
      const r = rec.payload as MarketBlindResolutionAuditRecord, c = this.commitsByHash.get(r.entryHash);
      if (!c || !Number.isFinite(r.resolvedAtMs) || c.committedAtMs >= r.resolvedAtMs) { this.hindcastFlag = true; throw new MarketBlindIntegrityError(`Invalid/backdated resolution at line ${i}`); }
      this.applyResolution(r);
    }
    this.nextSeq += 1; this.lastChainHash = rec.entryHash;
  }
}

export function submitMarketBlindForecast(ledger: ProspectivePipelineLedger, input: ProspectiveCommitInput): ProspectiveCommitReceipt {
  if (input.prompt) assertMarketBlindClean(input.prompt);
  const docs: MarketBlindDocumentInput[] = typeof input.evidence === 'string' ? [{ id: 'evidence-0', title: input.prompt ?? 'evidence', content: input.evidence }] : [...input.evidence];
  for (const doc of docs) assertMarketBlindClean(JSON.stringify(doc));
  const sanitized = sanitizeMarketBlindContext({ documents: docs, eventResolutionOrCutoffMs: input.eventResolutionOrCutoffMs }, { ...input.sanitizerConfig, modelKnowledgeCutoffMs: input.modelKnowledgeCutoffMs ?? input.sanitizerConfig?.modelKnowledgeCutoffMs });
  return ledger.commit({ questionId: input.questionId, category: input.category ?? 'general', pRaw: input.pRaw, modelVersion: input.modelVersion, promptVersion: input.promptVersion ?? 'v1', committedAtMs: input.committedAtMs ?? Date.now(), contextHash: sanitized.contextHash });
}
export function attachPostCommitMarketSnapshot(ledger: ProspectivePipelineLedger, receiptOrHash: ProspectiveCommitReceipt | string, snap: PostCommitMarketSnapshotInput): PostCommitMarketSnapshotRecord {
  if (typeof receiptOrHash !== 'string') verifySealedForecastReceipt(receiptOrHash.sealedReceipt);
  const entryHash = typeof receiptOrHash === 'string' ? receiptOrHash : receiptOrHash.entryHash, commit = ledger.commitsByHash.get(entryHash);
  if (!commit) throw new MarketBlindError('UNSEALED_FORECAST_RECEIPT', `Unknown forecast commit hash: ${entryHash}`);
  assertOpenProb('marketProb', snap.marketProb);
  const marketReadAtMs = snap.marketReadAtMs ?? Date.now();
  if (!Number.isFinite(marketReadAtMs) || marketReadAtMs < commit.committedAtMs) throw new MarketBlindError('HINDCAST_CONTAMINATION_BLOCKED', `marketReadAtMs (${marketReadAtMs}) < committedAtMs (${commit.committedAtMs})`);
  return ledger.snapshot({ entryHash, marketProb: snap.marketProb, marketReadAtMs, source: snap.source ?? 'polymarket-live' });
}
export function recordMarketBlindResolution(ledger: ProspectivePipelineLedger, input: MarketBlindResolutionInput): MarketBlindResolutionAuditRecord[] {
  if (!RESOLUTION_STATES.has(input.status)) throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', `Unsupported status: ${String(input.status)}`);
  const targets = input.entryHash ? (ledger.commitsByHash.get(input.entryHash) ? [ledger.commitsByHash.get(input.entryHash)!] : [])
    : (input.questionId ? (ledger.commitsByQuestion.get(input.questionId) ?? []).filter((c) => !ledger.resolutions.has(c.entryHash)) : []);
  if (targets.length === 0) throw new MarketBlindError('UNSEALED_FORECAST_RECEIPT', 'No unresolved committed forecast matched target');
  const resolvedAtMs = input.resolvedAtMs ?? Date.now(), outcome: 0 | 1 | null = input.status === 'RESOLVED_YES' ? 1 : input.status === 'RESOLVED_NO' ? 0 : null;
  return targets.map((commit) => {
    if (ledger.resolutions.has(commit.entryHash)) throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', `Already resolved: ${commit.entryHash}`);
    if (!Number.isFinite(resolvedAtMs) || commit.committedAtMs >= resolvedAtMs) throw new MarketBlindError('HINDCAST_CONTAMINATION_BLOCKED', `committedAtMs (${commit.committedAtMs}) >= resolvedAtMs (${resolvedAtMs})`);
    const snap = ledger.snapshots.get(commit.entryHash), marketProb = input.marketProb ?? snap?.marketProb ?? null, marketReadAtMs = input.marketReadAtMs ?? snap?.marketReadAtMs ?? null;
    if (outcome !== null) {
      if (marketProb === null || marketReadAtMs === null) throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'Post-commit market snapshot required for binary resolution');
      assertOpenProb('marketProb', marketProb);
      if (!Number.isFinite(marketReadAtMs) || marketReadAtMs < commit.committedAtMs) throw new MarketBlindError('HINDCAST_CONTAMINATION_BLOCKED', `marketReadAtMs (${marketReadAtMs}) < committedAtMs (${commit.committedAtMs})`);
    }
    return ledger.resolve({ entryHash: commit.entryHash, questionId: commit.questionId, status: input.status, outcome, resolvedAtMs, marketProb, marketReadAtMs, ...(input.note ? { note: input.note } : {}) });
  });
}
export function evaluateProspectiveOosReport(ledger: ProspectivePipelineLedger, options: ProspectiveOosReportOptions = {}): ProspectiveOosReport {
  const commits = [...ledger.commitsByHash.values()].filter((c) => options.category === undefined || c.category === options.category);
  const scored: Array<{ commit: ProspectiveCommitReceipt; res: MarketBlindResolutionAuditRecord }> = [];
  let voidedCount = 0, cancelledCount = 0, umaDisputedCount = 0, pendingCount = 0, hindcastDetected = ledger.hasHindcastViolation();
  for (const commit of commits) {
    const snap = ledger.snapshots.get(commit.entryHash), res = ledger.resolutions.get(commit.entryHash);
    if (snap && snap.marketReadAtMs < commit.committedAtMs) hindcastDetected = true;
    if (!res) { pendingCount += 1; continue; }
    if (commit.committedAtMs >= res.resolvedAtMs || (res.marketReadAtMs !== null && res.marketReadAtMs < commit.committedAtMs)) hindcastDetected = true;
    if (res.status === 'VOIDED') voidedCount += 1;
    else if (res.status === 'CANCELLED') cancelledCount += 1;
    else if (res.status === 'UMA_DISPUTED') umaDisputedCount += 1;
    else if (res.outcome !== null && res.marketProb !== null) scored.push({ commit, res });
  }
  scored.sort((a, b) => a.res.resolvedAtMs - b.res.resolvedAtMs || a.commit.committedAtMs - b.commit.committedAtMs);
  const oos: OosEvaluationRecord[] = scored.map(({ commit, res }) => ({ pCal: options.calibrate ? options.calibrate(commit.pRaw) : commit.pRaw, pMarket: res.marketProb!, outcome: res.outcome! }));
  const m = evaluateCalibrationMetrics(oos), gate = evaluateSkillGate(m, options.config), n = scored.length;
  const chainVerified = ledger.verifyChainIntegrity(), unlocked = gate.passed && chainVerified && !hindcastDetected;
  const minResolved = options.config?.minResolvedQuestions ?? DEFAULT_POSTERIOR_CONFIG.minResolvedQuestions;
  const verdict: ProspectiveOosVerdict = n < minResolved ? 'INSUFFICIENT_DATA' : (unlocked ? 'PASS_PROSPECTIVE_SKILL' : 'FAIL_CALIBRATION');
  return {
    committedCount: commits.length, resolvedScoredCount: n, voidedCount, cancelledCount, umaDisputedCount, pendingCount,
    brierModel: numOrNull(n, m.bsModel), brierMarket: numOrNull(n, m.bsMarket), bssOos: numOrNull(n, m.bssOos), bssLower95: numOrNull(n, m.bssLower95),
    ece: numOrNull(n, m.ece), rolling100ModelBrier: numOrNull(n, m.rolling100ModelBrier), rolling100MarketBrier: numOrNull(n, m.rolling100MarketBrier),
    skillGate: { wSkill: unlocked ? gate.wSkill : 0, unlocked, reasons: gate.reasons }, verdict, chainVerified, hindcastDetected,
  };
}
