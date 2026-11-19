import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { loadICEvidenceForScorecard } from '../../src/desk/polymarket/ic-evidence-loader';
import { evaluateICKpiScorecard } from '../../src/desk/polymarket/ic-kpi-scorecard';
import { buildL2ArchiveManifest } from '../../src/desk/polymarket/l2/l2-archive-manifest';
import { COVERAGE_TEST_NOW, coverageBookRecords, sealCoverageFixture, writeCoverageWal } from './l2/l2-coverage-fixtures';
import { createNodeJsonlAppendStore } from '../../src/desk/polymarket/market-blind/node-market-blind-ledger-adapter';
import {
  attachPostCommitMarketSnapshot,
  evaluateProspectiveOosReport,
  ProspectivePipelineLedger,
  recordMarketBlindResolution,
  submitMarketBlindForecast,
} from '../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline';

const tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ic-evidence-loader-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('IC Evidence Loader (POLY-G7.5 Phase 5)', () => {
  it('defaults fail-closed to 0 samples when directories do not exist', () => {
    const loaded = loadICEvidenceForScorecard({
      l2ArchiveDir: '/nonexistent/l2-archive-g7-5',
      marketBlindLedgerPath: '/nonexistent/mb-ledger-g7-5.jsonl',
    });
    expect(loaded.samples).toEqual({
      recordedL2Days: 0,
      qualifyingMakerFills: 0,
      resolvedOosForecasts: 0,
    });
    expect(loaded.integrity.errors).toEqual([]);
    const report = evaluateICKpiScorecard(loaded.scorecardInput);
    expect(report.verdicts['30_DAY_L2_DATA']).toBe('INSUFFICIENT_DATA');
    expect(report.verdicts.MAKER_ALPHA).toBe('INSUFFICIENT_DATA');
    expect(report.verdicts.MARKET_BLIND_ALPHA).toBe('INSUFFICIENT_DATA');
    expect(report.verdicts.ECONOMIC_G11).toBe('HOLD');
    expect(report.verdicts.LEGAL_G12).toBe('HOLD');
    expect(report.verdicts.FOUNDER_G13).toBe('HOLD');
    expect(report.verdicts.REAL_MONEY_TRADING).toBe('DISABLED');
  });

  it('counts verified WAL book coverage, not archive path dates, and rejects manifest tampering', () => {
    const root = makeTempDir();
    mkdirSync(join(root, '2026-11-17'));
    writeCoverageWal(root, coverageBookRecords());
    const l2CoveragePolicy = sealCoverageFixture(root);
    const options = { l2ArchiveDir: root, l2CoveragePolicy, generatedAtIso: COVERAGE_TEST_NOW };

    const valid = loadICEvidenceForScorecard(options);
    expect(valid.samples.recordedL2Days).toBe(1);
    expect(valid.integrity.l2ManifestChecked).toBe(true);
    expect(valid.integrity.l2ManifestOk).toBe(true);
    expect(valid.integrity.errors).toEqual([]);
    const noPolicy = loadICEvidenceForScorecard({ l2ArchiveDir: root });
    expect(noPolicy.samples.recordedL2Days).toBe(0);
    expect(noPolicy.integrity.errors).toEqual([expect.stringContaining('POLICY')]);

    writeFileSync(join(root, 'wal', 'segment_0001.wal'), 'tampered-wal');
    const tampered = loadICEvidenceForScorecard(options);
    expect(tampered.samples.recordedL2Days).toBe(0);
    expect(tampered.integrity.l2ManifestOk).toBe(false);
    expect(tampered.integrity.errors).toEqual([expect.stringContaining('MANIFEST')]);

    writeFileSync(join(root, 'l2-archive-manifest.json'), '{not-json');
    const corrupt = loadICEvidenceForScorecard(options);
    expect(corrupt.samples.recordedL2Days).toBe(0);
    expect(corrupt.integrity.l2ManifestOk).toBe(false);
  });

  it('does not count an empty date-named directory, even with a verified empty manifest', () => {
    const root = makeTempDir();
    mkdirSync(join(root, '2026-11-18'));
    writeFileSync(join(root, 'l2-archive-manifest.json'), JSON.stringify(buildL2ArchiveManifest(root)));
    expect(loadICEvidenceForScorecard({ l2ArchiveDir: root }).samples.recordedL2Days).toBe(0);
  });

  it.each([
    ['empty WAL', 'wal', Buffer.alloc(0)],
    ['corrupt WAL', 'wal', Buffer.from('not-a-wal')],
    ['empty Parquet', 'parquet', Buffer.alloc(0)],
    ['fake Parquet', 'parquet', Buffer.from('PAR1-not-valid-rows-PAR1')],
  ])('does not count %s merely because its filename contains a date', (_label, extension, bytes) => {
    const root = makeTempDir();
    writeFileSync(join(root, `2026-11-18.${extension}`), bytes);
    writeFileSync(join(root, 'l2-archive-manifest.json'), JSON.stringify(buildL2ArchiveManifest(root)));
    expect(loadICEvidenceForScorecard({ l2ArchiveDir: root }).samples.recordedL2Days).toBe(0);
  });

  it('does not qualify an archive without a manifest or approved coverage policy', () => {
    const root = makeTempDir();
    mkdirSync(join(root, '2026-11-18'));
    expect(loadICEvidenceForScorecard({ l2ArchiveDir: root }).samples.recordedL2Days).toBe(0);
  });

  it('keeps diagnostic Market-Blind resolutions out of IC metrics when approval and checkpoint are absent', () => {
    const root = makeTempDir();
    const ledgerPath = join(root, 'market-blind.jsonl');
    const store = createNodeJsonlAppendStore(ledgerPath);
    const ledger = new ProspectivePipelineLedger(store);
    const baseMs = Date.UTC(2026, 10, 19, 10, 0, 0);
    const receipt = submitMarketBlindForecast(ledger, {
      questionId: 'q-diagnostic-only', researchQuestionId: 'rq-diagnostic-only', eventId: 'event-diagnostic-only',
      marketId: 'market-diagnostic-only', forecastHorizonMs: 60_000,
      provenance: { kind: 'REAL', source: 'fixture-feed', reference: 'fixture-ref' },
      category: 'politics', pRaw: 0.72, modelVersion: 'fixture-model-v1', evidence: 'public filing', committedAtMs: baseMs,
    });
    attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.5, marketReadAtMs: baseMs + 2_000 });
    recordMarketBlindResolution(ledger, { entryHash: receipt.entryHash, status: 'RESOLVED_YES', resolvedAtMs: baseMs + 60_000 });

    const loaded = loadICEvidenceForScorecard({ marketBlindLedgerPath: ledgerPath, marketBlindModelVersion: 'fixture-model-v1' });
    expect(loaded.marketBlindReport?.reportMode).toBe('empirical');
    expect(loaded.marketBlindReport?.resolvedScoredCount).toBe(0);
    expect(loaded.marketBlindReport?.resolvedEligibleCount).toBe(0);
    expect(loaded.samples.resolvedOosForecasts).toBe(0);
    expect(loaded.scorecardInput.bssOos).toBeUndefined();
    expect(loaded.scorecardInput.ece).toBeUndefined();
    expect(loaded.integrity.marketBlindChainOk).toBe(false);
    expect(loaded.integrity.errors.some((error) => error.includes('APPROVED_REPEATED_FORECAST_POLICY_REQUIRED'))).toBe(true);
  });

  it('feeds only checkpointed, approved, real-provenance unique forecasts and canonical metrics into IC', () => {
    const root = makeTempDir();
    const ledgerPath = join(root, 'market-blind.jsonl');
    const checkpointPath = join(root, 'trusted-checkpoint.json');
    const store = createNodeJsonlAppendStore(ledgerPath, checkpointPath);
    const ledger = new ProspectivePipelineLedger(store);
    const baseMs = Date.UTC(2026, 10, 19, 10, 0, 0);
    const approvedAtMs = baseMs - 1_000;
    const policy = {
      policyId: 'policy-live-review-7', approvalStatus: 'APPROVED' as const, approvedBy: 'ic-approver-7',
      approvedAtMs, approvalEvidenceRef: 'approval-record-7', modelVersion: 'approved-model-v1',
      repeatedForecastRule: 'FIRST_COMMIT_PER_RESEARCH_QUESTION' as const,
    };
    const addResolved = (questionId: string, marketId: string, modelVersion: string, kind: 'REAL' | 'SYNTHETIC', index: number) => {
      const committedAtMs = baseMs + index * 10_000;
      const receipt = submitMarketBlindForecast(ledger, {
        questionId, researchQuestionId: questionId, eventId: `event-${index}`, marketId,
        forecastHorizonMs: 60_000, provenance: { kind, source: kind === 'REAL' ? 'authorized-feed' : 'SYNTHETIC', reference: `capture-${index}` },
        category: 'politics', pRaw: 0.72, modelVersion, evidence: 'public filing', committedAtMs,
      });
      attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.5, marketReadAtMs: committedAtMs + 2_000 });
      recordMarketBlindResolution(ledger, { entryHash: receipt.entryHash, status: 'RESOLVED_YES', resolvedAtMs: committedAtMs + 60_000 });
    };
    addResolved('q-approved-a', 'market-approved-a', 'approved-model-v1', 'REAL', 0);
    addResolved('q-approved-a-revised', 'market-approved-a', 'approved-model-v1', 'REAL', 1);
    addResolved('q-synthetic', 'market-synthetic', 'approved-model-v1', 'SYNTHETIC', 2);
    addResolved('q-wrong-model', 'market-wrong-model', 'other-model-v1', 'REAL', 3);

    const options = { marketBlindLedgerPath: ledgerPath, marketBlindCheckpointPath: checkpointPath, marketBlindPolicy: policy, marketBlindModelVersion: 'approved-model-v1' };
    const loaded = loadICEvidenceForScorecard(options);
    const direct = evaluateProspectiveOosReport(ProspectivePipelineLedger.hydrateFromStore(createNodeJsonlAppendStore(ledgerPath, checkpointPath)), {
      mode: 'empirical', modelVersion: 'approved-model-v1', policy,
    });
    expect(direct.empiricalEligible).toBe(true);
    expect(direct.resolvedEligibleCount).toBe(1);
    expect(loaded.samples.resolvedOosForecasts).toBe(1);
    expect(loaded.scorecardInput.bssOos).toBe(direct.bssOos);
    expect(loaded.scorecardInput.ece).toBe(direct.ece);
    expect(loaded.scorecardInput).not.toHaveProperty('brierSkillScoreOos');
    expect(loaded.scorecardInput).not.toHaveProperty('brierEce');
    expect(loaded.integrity.marketBlindChainOk).toBe(true);
    expect(loaded.integrity.errors).toEqual([]);

    const mismatched = loadICEvidenceForScorecard({ ...options, marketBlindCheckpointPath: undefined });
    expect(mismatched.samples.resolvedOosForecasts).toBe(0);
  });

  it('fails closed on requested-checkpoint mismatch and never bootstraps a legacy unanchored ledger', () => {
    const root = makeTempDir();
    const ledgerPath = join(root, 'market-blind.jsonl');
    const expectedCheckpoint = join(root, 'expected-checkpoint.json');
    const actualCheckpoint = join(root, 'actual-checkpoint.json');
    const store = createNodeJsonlAppendStore(ledgerPath, actualCheckpoint);
    const ledger = new ProspectivePipelineLedger(store);
    const baseMs = Date.UTC(2026, 10, 19, 10, 0, 0);
    const receipt = submitMarketBlindForecast(ledger, {
      questionId: 'q-anchor-test', researchQuestionId: 'rq-anchor-test', eventId: 'event-anchor-test', marketId: 'market-anchor-test',
      forecastHorizonMs: 60_000, provenance: { kind: 'REAL', source: 'authorized-feed', reference: 'capture-anchor' },
      category: 'politics', pRaw: 0.72, modelVersion: 'approved-model-v1', evidence: 'public filing', committedAtMs: baseMs,
    });
    attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.5, marketReadAtMs: baseMs + 2_000 });
    recordMarketBlindResolution(ledger, { entryHash: receipt.entryHash, status: 'RESOLVED_YES', resolvedAtMs: baseMs + 60_000 });
    const policy = {
      policyId: 'policy-live-review-8', approvalStatus: 'APPROVED' as const, approvedBy: 'ic-approver-8', approvedAtMs: baseMs - 1_000,
      approvalEvidenceRef: 'approval-record-8', modelVersion: 'approved-model-v1',
      repeatedForecastRule: 'FIRST_COMMIT_PER_RESEARCH_QUESTION' as const,
    };
    const mismatch = loadICEvidenceForScorecard({ marketBlindLedgerPath: ledgerPath, marketBlindCheckpointPath: expectedCheckpoint, marketBlindPolicy: policy, marketBlindModelVersion: 'approved-model-v1' });
    expect(mismatch.samples.resolvedOosForecasts).toBe(0);
    expect(mismatch.integrity.marketBlindChainOk).toBe(false);
    expect(mismatch.integrity.errors.some((error) => error.includes('checkpoint'))).toBe(true);

    const raw = readFileSync(ledgerPath, 'utf8');
    const legacyPath = join(root, 'legacy.jsonl');
    const legacyAnchor = join(root, 'legacy.jsonl.checkpoint.json');
    writeFileSync(legacyPath, raw);
    writeFileSync(legacyAnchor, JSON.stringify({ version: 1, recordCount: 1, headHash: createHash('sha256').update('untrusted').digest('hex') }));
    const legacy = loadICEvidenceForScorecard({ marketBlindLedgerPath: legacyPath, marketBlindPolicy: policy, marketBlindModelVersion: 'approved-model-v1' });
    expect(legacy.samples.resolvedOosForecasts).toBe(0);
    expect(legacy.integrity.marketBlindChainOk).toBe(false);
  });

  it('loads valid prospective Market-Blind JSONL ledger and fails closed on chain tamper', () => {
    const root = makeTempDir();
    const ledgerPath = join(root, 'market-blind.jsonl');
    const checkpointPath = join(root, 'market-blind.checkpoint.json');
    const store = createNodeJsonlAppendStore(ledgerPath, checkpointPath);
    const ledger = new ProspectivePipelineLedger(store);
    const baseMs = Date.UTC(2026, 10, 19, 10, 0, 0);
    const policy = {
      policyId: 'policy-g83-tamper-check',
      approvalStatus: 'APPROVED' as const,
      approvedBy: 'ic-chair-fixture',
      approvedAtMs: baseMs - 1_000,
      approvalEvidenceRef: 'ic-minutes-2026-11-19',
      modelVersion: 'blind-model-v1',
      repeatedForecastRule: 'FIRST_COMMIT_PER_RESEARCH_QUESTION' as const,
    };

    for (let i = 0; i < 3; i += 1) {
      const receipt = submitMarketBlindForecast(ledger, {
        questionId: `q-g75-${i}`,
        researchQuestionId: `rq-g75-${i}`,
        eventId: `event-g75-${i}`,
        marketId: `market-g75-${i}`,
        forecastHorizonMs: 60_000,
        provenance: { kind: 'REAL', source: 'authorized-feed', reference: `ref-${i}` },
        category: 'politics',
        pRaw: i % 2 === 0 ? 0.72 : 0.28,
        modelVersion: 'blind-model-v1',
        evidence: 'Public legislative vote tally and committee filing.',
        committedAtMs: baseMs + i * 10_000,
      });
      attachPostCommitMarketSnapshot(ledger, receipt, {
        marketProb: 0.5,
        marketReadAtMs: baseMs + i * 10_000 + 2_000,
      });
      recordMarketBlindResolution(ledger, {
        entryHash: receipt.entryHash,
        status: i % 2 === 0 ? 'RESOLVED_YES' : 'RESOLVED_NO',
        resolvedAtMs: baseMs + i * 10_000 + 60_000,
      });
    }

    const strictOptions = {
      marketBlindLedgerPath: ledgerPath,
      marketBlindCheckpointPath: checkpointPath,
      marketBlindPolicy: policy,
      marketBlindModelVersion: 'blind-model-v1',
    };
    const loaded = loadICEvidenceForScorecard(strictOptions);
    expect(loaded.samples.resolvedOosForecasts).toBe(3);
    expect(loaded.integrity.marketBlindChainOk).toBe(true);
    expect(loaded.marketBlindReport?.skillGate.wSkill).toBe(0);
    expect(loaded.marketBlindReport?.verdict).toBe('INSUFFICIENT_DATA');

    const scorecard = evaluateICKpiScorecard(loaded.scorecardInput);
    expect(scorecard.verdicts.MARKET_BLIND_ALPHA).toBe('INSUFFICIENT_DATA');
    expect(scorecard.verdicts.REAL_MONEY_TRADING).toBe('DISABLED');

    // Tamper with JSONL ledger -> must fail closed to 0 resolved forecasts
    writeFileSync(ledgerPath, '{"seq":1,"corrupt":true}\n');
    const tampered = loadICEvidenceForScorecard(strictOptions);
    expect(tampered.samples.resolvedOosForecasts).toBe(0);
    expect(tampered.integrity.marketBlindChainOk).toBe(false);
    expect(tampered.integrity.errors.length).toBe(1);
  });
});
