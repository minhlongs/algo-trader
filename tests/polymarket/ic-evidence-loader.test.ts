import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadICEvidenceForScorecard } from '../../src/desk/polymarket/ic-evidence-loader';
import { evaluateICKpiScorecard } from '../../src/desk/polymarket/ic-kpi-scorecard';
import { buildL2ArchiveManifest } from '../../src/desk/polymarket/l2/l2-archive-manifest';
import { COVERAGE_TEST_NOW, coverageBookRecords, sealCoverageFixture, writeCoverageWal } from './l2/l2-coverage-fixtures';
import { createNodeJsonlAppendStore } from '../../src/desk/polymarket/market-blind/node-market-blind-ledger-adapter';
import {
  attachPostCommitMarketSnapshot,
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

  it('loads valid prospective Market-Blind JSONL ledger and fails closed on chain tamper', () => {
    const root = makeTempDir();
    const ledgerPath = join(root, 'market-blind.jsonl');
    const store = createNodeJsonlAppendStore(ledgerPath);
    const ledger = new ProspectivePipelineLedger(store);
    const baseMs = Date.UTC(2026, 10, 19, 10, 0, 0);

    for (let i = 0; i < 3; i += 1) {
      const receipt = submitMarketBlindForecast(ledger, {
        questionId: `q-g75-${i}`,
        category: 'politics',
        pRaw: i % 2 === 0 ? 0.72 : 0.28,
        modelVersion: 'test-blind-v1',
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

    const loaded = loadICEvidenceForScorecard({ marketBlindLedgerPath: ledgerPath });
    expect(loaded.samples.resolvedOosForecasts).toBe(3);
    expect(loaded.integrity.marketBlindChainOk).toBe(true);
    expect(loaded.marketBlindReport?.skillGate.wSkill).toBe(0);
    expect(loaded.marketBlindReport?.verdict).toBe('INSUFFICIENT_DATA');

    const scorecard = evaluateICKpiScorecard(loaded.scorecardInput);
    expect(scorecard.verdicts.MARKET_BLIND_ALPHA).toBe('INSUFFICIENT_DATA');
    expect(scorecard.verdicts.REAL_MONEY_TRADING).toBe('DISABLED');

    // Tamper with JSONL ledger -> must fail closed to 0 resolved forecasts
    writeFileSync(ledgerPath, '{"seq":1,"corrupt":true}\n');
    const tampered = loadICEvidenceForScorecard({ marketBlindLedgerPath: ledgerPath });
    expect(tampered.samples.resolvedOosForecasts).toBe(0);
    expect(tampered.integrity.marketBlindChainOk).toBe(false);
    expect(tampered.integrity.errors.length).toBe(1);
  });
});
