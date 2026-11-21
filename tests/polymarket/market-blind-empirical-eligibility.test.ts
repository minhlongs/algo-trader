import { describe, expect, it } from 'vitest';
import { MarketBlindJournal } from '../../src/desk/polymarket/market-blind/market-blind-journal';
import { createInMemoryAppendOnlyStore } from '../../src/desk/polymarket/market-blind/market-blind-ledger-store';
import { ProspectivePipelineLedger, attachPostCommitMarketSnapshot, evaluateProspectiveOosReport, recordMarketBlindResolution, submitMarketBlindForecast, type ApprovedRepeatedForecastPolicy, type ProspectiveCommitInput } from '../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline';

// Approval fixtures exercise validation only. They are not real IC approvals or empirical evidence.
const policy: ApprovedRepeatedForecastPolicy = { policyId: 'approval-fixture', approvalStatus: 'APPROVED', approvedBy: 'fixture-reviewer',
  approvedAtMs: 500, approvalEvidenceRef: 'local-fixture-record', modelVersion: 'model-v1', repeatedForecastRule: 'FIRST_COMMIT_PER_RESEARCH_QUESTION' };
const options = { mode: 'empirical' as const, modelVersion: 'model-v1', policy };
function commit(ledger: ProspectivePipelineLedger, id: string, overrides: Partial<ProspectiveCommitInput> = {}) {
  return submitMarketBlindForecast(ledger, { questionId: id, researchQuestionId: `research-${id}`, eventId: `event-${id}`, marketId: `market-${id}`,
    forecastId: `forecast-${id}`, forecastHorizonMs: 5000, provenance: { kind: 'REAL', source: 'official-publication', reference: `publication-${id}` },
    modelVersion: 'model-v1', pRaw: 0.6, evidence: 'Official source document.', committedAtMs: 1000, ...overrides });
}
function resolve(ledger: ProspectivePipelineLedger, receipt: ReturnType<typeof commit>, resolvedAtMs = 2000): void {
  attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.5, marketReadAtMs: receipt.committedAtMs + 1, source: 'official-market-feed' });
  recordMarketBlindResolution(ledger, { entryHash: receipt.entryHash, status: 'RESOLVED_YES', resolvedAtMs });
}

describe('approval-bound empirical forecast eligibility', () => {
  it('excludes backdated historical forecasts recorded after resolution', () => {
    const ledger = new ProspectivePipelineLedger(undefined, () => 2000);
    const receipt = commit(ledger, 'historical');
    expect(receipt.recordedAtMs).toBe(2000);
    resolve(ledger, receipt);
    const report = evaluateProspectiveOosReport(ledger, options);
    expect(report.resolvedScoredCount).toBe(0);
    expect(report.resolvedEligibleCount).toBe(0);
    expect(report.eligibilityReasons).toContain('UNATTESTED_OR_BACKFILL_FORECASTS_EXCLUDED');
  });
  it('replays legacy records without inventing recording attestation', () => {
    const original = createInMemoryAppendOnlyStore();
    const ledger = new ProspectivePipelineLedger(original, () => 1000);
    resolve(ledger, commit(ledger, 'legacy'));
    const legacy = createInMemoryAppendOnlyStore(), journal = new MarketBlindJournal(legacy);
    for (const line of original.readAllLines()) {
      const record = JSON.parse(line) as { kind: string; payload: Record<string, unknown> };
      delete record.payload.recordedAtMs;
      journal.append(record.kind, record.payload);
    }
    const restored = ProspectivePipelineLedger.hydrateFromStore(legacy);
    const report = evaluateProspectiveOosReport(restored, options);
    expect(report.resolvedScoredCount).toBe(0);
    expect(report.resolvedEligibleCount).toBe(0);
    expect(report.eligibilityReasons).toContain('UNATTESTED_OR_BACKFILL_FORECASTS_EXCLUDED');
    expect(evaluateProspectiveOosReport(restored).eligibilityReasons).toContain('UNATTESTED_OR_BACKFILL_FORECASTS_EXCLUDED');
  });
  it('separates diagnostic scores from strict approval-bound eligible counts and preserves metadata on replay', () => {
    const store = createInMemoryAppendOnlyStore(), ledger = new ProspectivePipelineLedger(store, () => 1000), receipt = commit(ledger, 'q1');
    resolve(ledger, receipt);
    const diagnostic = evaluateProspectiveOosReport(ledger);
    expect(diagnostic.resolvedScoredCount).toBe(1);
    expect(diagnostic.resolvedEligibleCount).toBe(0);
    expect(diagnostic.empiricalEligible).toBe(false);
    expect(evaluateProspectiveOosReport(ledger, { mode: 'empirical', modelVersion: 'model-v1' })).toMatchObject({ resolvedEligibleCount: 0, empiricalEligible: false });
    const restored = ProspectivePipelineLedger.hydrateFromStore(store);
    expect(restored.commitsByHash.get(receipt.entryHash)?.recordedAtMs).toBe(1000);
    expect(restored.commitsByHash.get(receipt.entryHash)?.forecastId).toBe(receipt.forecastId);
    expect(restored.commitsByHash.get(receipt.entryHash)?.provenance).toEqual(receipt.provenance);
    expect(evaluateProspectiveOosReport(restored, options)).toMatchObject({ resolvedEligibleCount: 1, integrityVerified: true, empiricalEligible: true });
  });
  it('requires independently retained checkpoint, model selection, matching approval and prospective approval date', () => {
    const rows: string[] = [];
    const unanchored = new ProspectivePipelineLedger({ appendLine: (line) => { rows.push(line); }, readAllLines: () => [...rows] });
    resolve(unanchored, commit(unanchored, 'q1'));
    expect(evaluateProspectiveOosReport(unanchored, options)).toMatchObject({ resolvedEligibleCount: 0, integrityVerified: false });
    const ledger = new ProspectivePipelineLedger(undefined, () => 1000); resolve(ledger, commit(ledger, 'q1'));
    expect(evaluateProspectiveOosReport(ledger, { ...options, modelVersion: undefined }).resolvedEligibleCount).toBe(0);
    expect(evaluateProspectiveOosReport(ledger, { ...options, policy: { ...policy, modelVersion: 'other' } }).resolvedEligibleCount).toBe(0);
    expect(evaluateProspectiveOosReport(ledger, { ...options, policy: { ...policy, approvedAtMs: 1500 } }).resolvedEligibleCount).toBe(0);
    expect(evaluateProspectiveOosReport(ledger, { ...options, policy: { ...policy, approvalStatus: 'PENDING' } as unknown as ApprovedRepeatedForecastPolicy }).resolvedEligibleCount).toBe(0);
    expect(evaluateProspectiveOosReport(ledger, { ...options, config: { minResolvedQuestions: 1 } }).resolvedEligibleCount).toBe(0);
  });
  it('never pools models and excludes synthetic or incomplete provenance', () => {
    const ledger = new ProspectivePipelineLedger(undefined, () => 1000);
    resolve(ledger, commit(ledger, 'real'));
    resolve(ledger, commit(ledger, 'other-model', { modelVersion: 'model-v2' }));
    resolve(ledger, commit(ledger, 'synthetic', { provenance: { kind: 'SYNTHETIC', source: 'fixture', reference: 'local' } }));
    resolve(ledger, commit(ledger, 'missing', { eventId: undefined }));
    resolve(ledger, commit(ledger, 'TEST_ONLY-labelled'));
    expect(evaluateProspectiveOosReport(ledger).resolvedScoredCount).toBe(0);
    expect(evaluateProspectiveOosReport(ledger, options).resolvedEligibleCount).toBe(1);
  });
  it('selects the first commit before inspecting outcomes and deduplicates both question identities', () => {
    const ledger = new ProspectivePipelineLedger(undefined, () => 1000);
    const first = commit(ledger, 'q1');
    resolve(ledger, commit(ledger, 'q1-repeat', { researchQuestionId: 'research-q1' }));
    resolve(ledger, commit(ledger, 'q1', { forecastId: 'different-forecast', researchQuestionId: 'different-research', committedAtMs: 1200 }));
    resolve(ledger, commit(ledger, 'alias-chain', { researchQuestionId: 'different-research' }));
    resolve(ledger, commit(ledger, 'market-alias', { marketId: 'market-q1' }));
    expect(evaluateProspectiveOosReport(ledger, options).resolvedEligibleCount).toBe(0);
    resolve(ledger, first);
    expect(evaluateProspectiveOosReport(ledger, options).resolvedEligibleCount).toBe(1);
    expect(() => commit(ledger, 'q2', { forecastId: first.forecastId })).toThrow(/Duplicate forecastId/);
  });
  it('makes exact resolution retries idempotent by entry hash or question but rejects conflicts', () => {
    const ledger = new ProspectivePipelineLedger(undefined, () => 1000), receipt = commit(ledger, 'q1');
    resolve(ledger, receipt);
    const before = ledger.recordCount(), input = { questionId: 'q1', status: 'RESOLVED_YES' as const, resolvedAtMs: 2000 };
    expect(recordMarketBlindResolution(ledger, input)).toHaveLength(1);
    expect(recordMarketBlindResolution(ledger, { ...input, entryHash: receipt.entryHash })).toHaveLength(1);
    expect(ledger.recordCount()).toBe(before);
    expect(() => recordMarketBlindResolution(ledger, { ...input, status: 'RESOLVED_NO' })).toThrow(/Conflicting duplicate/);
    expect(() => recordMarketBlindResolution(ledger, { ...input, resolvedAtMs: 2500 })).toThrow(/Conflicting duplicate/);
  });
  it('rejects persisted semantic inconsistencies and cannot mutate public map snapshots', () => {
    const ledger = new ProspectivePipelineLedger(undefined, () => 1000), receipt = commit(ledger, 'q1');
    expect(() => ledger.resolve({ entryHash: receipt.entryHash, questionId: 'other', status: 'RESOLVED_YES', outcome: 1, resolvedAtMs: 2000, marketProb: 0.5, marketReadAtMs: 1100 })).toThrow(/mismatch/);
    expect(() => ledger.resolve({ entryHash: receipt.entryHash, questionId: 'q1', status: 'RESOLVED_YES', outcome: 0, resolvedAtMs: 2000, marketProb: 0.5, marketReadAtMs: 1100 })).toThrow(/mismatch/);
    (ledger.commitsByHash as Map<string, unknown>).clear();
    expect(ledger.commitsByHash.size).toBe(1);
    expect(Object.isFrozen(receipt.provenance)).toBe(true);
  });
});
