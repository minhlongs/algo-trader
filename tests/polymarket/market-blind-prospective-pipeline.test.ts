import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MarketBlindIntegrityError, createInMemoryAppendOnlyStore } from '../../src/desk/polymarket/market-blind/market-blind-ledger-store';
import { ProspectivePipelineLedger, attachPostCommitMarketSnapshot, evaluateProspectiveOosReport, recordMarketBlindResolution, submitMarketBlindForecast } from '../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline';
import { MarketBlindError } from '../../src/desk/polymarket/market-blind/market-blind-types';
import { createNodeJsonlAppendStore } from '../../src/desk/polymarket/market-blind/node-market-blind-ledger-adapter';

const BASE_MS = 1_764_000_000_000;
const tempDirs: string[] = [];
const createTempLedgerPath = (nested = true): string => {
  const dir = mkdtempSync(join(tmpdir(), 'poly-mb-pipeline-'));
  tempDirs.push(dir);
  return nested ? join(dir, 'nested', 'ledger.jsonl') : join(dir, 'ledger.jsonl');
};
afterEach(() => { while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true }); });

function seedWellCalibrated(ledger: ProspectivePipelineLedger, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const highBucket = Math.floor(i / 5) % 2 === 0;
    const pRaw = highBucket ? 0.80 : 0.20;
    const status = (highBucket ? (i % 5 !== 0) : (i % 5 === 0)) ? 'RESOLVED_YES' : 'RESOLVED_NO';
    const marketProb = highBucket ? 0.55 : 0.45;
    const t0 = BASE_MS + i * 1_000;
    const receipt = submitMarketBlindForecast(ledger, {
      questionId: `q-cal-${i}`, category: 'macro', pRaw, modelVersion: 'mb-v1', promptVersion: 'p-v1',
      evidence: `Primary macro filing #${i} without odds.`, committedAtMs: t0,
    });
    attachPostCommitMarketSnapshot(ledger, receipt, { marketProb, marketReadAtMs: t0 + 100 });
    recordMarketBlindResolution(ledger, { entryHash: receipt.entryHash, status, resolvedAtMs: t0 + 500 });
  }
}

describe('Prospective Market-Blind Forecast Pipeline', () => {
  it('enforces seal-before-price, rejects evidence price leaks, pre-commit reads, and hindcast backdating', () => {
    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore());

    expect(() => submitMarketBlindForecast(ledger, {
      questionId: 'q-leak-1', pRaw: 0.65, modelVersion: 'mb-v1',
      evidence: 'Polymarket currently shows 68% chance on this contract.', committedAtMs: BASE_MS,
    })).toThrow(/MARKET_ANCHOR_LEAKAGE_DETECTED/);

    expect(() => submitMarketBlindForecast(ledger, {
      questionId: 'q-leak-2', pRaw: 0.65, modelVersion: 'mb-v1',
      prompt: 'Contract trading at 58¢ ahead of vote', evidence: 'Clean legislative text.', committedAtMs: BASE_MS,
    })).toThrow(MarketBlindError);

    const receipt = submitMarketBlindForecast(ledger, {
      questionId: 'q-clean-1', category: 'politics', pRaw: 0.62, modelVersion: 'mb-v1', promptVersion: 'p-v2',
      evidence: 'Official committee schedule and roll-call count.', committedAtMs: BASE_MS,
    });
    expect(receipt.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.prevChainHash).toBe('0'.repeat(64));

    expect(() => attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.50, marketReadAtMs: BASE_MS - 1 }))
      .toThrow(/HINDCAST_CONTAMINATION_BLOCKED/);
    expect(() => attachPostCommitMarketSnapshot(ledger, 'f'.repeat(64), { marketProb: 0.50, marketReadAtMs: BASE_MS + 10 }))
      .toThrow(/UNSEALED_FORECAST_RECEIPT/);
    expect(() => attachPostCommitMarketSnapshot(ledger, { ...receipt, sealedReceipt: { ...receipt.sealedReceipt } }, { marketProb: 0.50, marketReadAtMs: BASE_MS + 10 }))
      .toThrow(/UNSEALED_FORECAST_RECEIPT/);

    attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.50, marketReadAtMs: BASE_MS + 50 });

    expect(() => recordMarketBlindResolution(ledger, {
      entryHash: receipt.entryHash, status: 'RESOLVED_YES', resolvedAtMs: BASE_MS,
    })).toThrow(/HINDCAST_CONTAMINATION_BLOCKED/);
    expect(() => recordMarketBlindResolution(ledger, {
      entryHash: receipt.entryHash, status: 'RESOLVED_YES', resolvedAtMs: BASE_MS - 500,
    })).toThrow(/HINDCAST_CONTAMINATION_BLOCKED/);
  });

  it('persists with 0o600 via Node JSONL store, rehydrates cleanly, and fails closed on tampering', () => {
    const filePath = createTempLedgerPath();
    const ledger = new ProspectivePipelineLedger(createNodeJsonlAppendStore(filePath));
    const r1 = submitMarketBlindForecast(ledger, {
      questionId: 'q-disk-1', category: 'macro', pRaw: 0.72, modelVersion: 'mb-v1',
      evidence: 'BLS employment release text.', committedAtMs: BASE_MS,
    });
    attachPostCommitMarketSnapshot(ledger, r1, { marketProb: 0.54, marketReadAtMs: BASE_MS + 25 });
    recordMarketBlindResolution(ledger, { entryHash: r1.entryHash, status: 'RESOLVED_YES', resolvedAtMs: BASE_MS + 1_000 });

    expect(statSync(filePath).mode & 0o777).toBe(0o600);

    const hydrated = ProspectivePipelineLedger.hydrateFromStore(createNodeJsonlAppendStore(filePath));
    expect(hydrated.recordCount()).toBe(3);
    const report = evaluateProspectiveOosReport(hydrated);
    expect(report.chainVerified).toBe(true);
    expect(report.hindcastDetected).toBe(false);
    expect(report.resolvedScoredCount).toBe(1);
    expect(report.skillGate.wSkill).toBe(0);

    const lines = readFileSync(filePath, 'utf8').trimEnd().split('\n');
    // 1) Modified byte
    const tamperedPath = createTempLedgerPath(false);
    writeFileSync(tamperedPath, `${lines[0]!.replace('0.72', '0.91')}\n${lines[1]}\n${lines[2]}\n`, 'utf8');
    expect(() => ProspectivePipelineLedger.hydrateFromStore(createNodeJsonlAppendStore(tamperedPath))).toThrow(MarketBlindIntegrityError);

    // 2) Truncated line
    const truncatedPath = createTempLedgerPath(false);
    writeFileSync(truncatedPath, `${lines[0]}\n${lines[1]!.slice(0, 24)}\n`, 'utf8');
    expect(() => ProspectivePipelineLedger.hydrateFromStore(createNodeJsonlAppendStore(truncatedPath))).toThrow(MarketBlindIntegrityError);

    // 3) Reordered entries
    const reorderedPath = createTempLedgerPath(false);
    writeFileSync(reorderedPath, `${lines[1]}\n${lines[0]}\n${lines[2]}\n`, 'utf8');
    expect(() => ProspectivePipelineLedger.hydrateFromStore(createNodeJsonlAppendStore(reorderedPath))).toThrow(MarketBlindIntegrityError);
  });

  it('audits VOIDED, CANCELLED, and UMA_DISPUTED resolutions while excluding them from OOS scoring', () => {
    const ledger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore());
    const states = ['RESOLVED_YES', 'RESOLVED_NO', 'VOIDED', 'CANCELLED', 'UMA_DISPUTED'] as const;
    for (let i = 0; i < states.length; i += 1) {
      const t0 = BASE_MS + i * 1_000;
      const r = submitMarketBlindForecast(ledger, {
        questionId: `q-state-${i}`, pRaw: i === 0 ? 0.80 : 0.20, modelVersion: 'mb-v1',
        evidence: `Primary source doc ${i}.`, committedAtMs: t0,
      });
      attachPostCommitMarketSnapshot(ledger, r, { marketProb: 0.50, marketReadAtMs: t0 + 10 });
      recordMarketBlindResolution(ledger, { questionId: `q-state-${i}`, status: states[i]!, resolvedAtMs: t0 + 500 });
    }
    // Also add 1 pending forecast
    submitMarketBlindForecast(ledger, {
      questionId: 'q-pending', pRaw: 0.55, modelVersion: 'mb-v1', evidence: 'Pending event doc.', committedAtMs: BASE_MS + 9_000,
    });

    const report = evaluateProspectiveOosReport(ledger);
    expect(report.committedCount).toBe(6);
    expect(report.resolvedScoredCount).toBe(2);
    expect(report.voidedCount).toBe(1);
    expect(report.cancelledCount).toBe(1);
    expect(report.umaDisputedCount).toBe(1);
    expect(report.pendingCount).toBe(1);
    // Only RESOLVED_YES (p=0.80, y=1 -> 0.04) and RESOLVED_NO (p=0.20, y=0 -> 0.04) enter Brier
    expect(report.brierModel).toBeCloseTo(0.04, 8);
    expect(report.brierMarket).toBeCloseTo(0.25, 8);
    expect(report.verdict).toBe('INSUFFICIENT_DATA');
    expect(report.skillGate.wSkill).toBe(0);
  });

  it('locks wSkill=0 for 0 and 50 resolved, unlocks for 160 well-calibrated, and fails closed on calibration/rolling-100 degradation', () => {
    const emptyReport = evaluateProspectiveOosReport(new ProspectivePipelineLedger(createInMemoryAppendOnlyStore()));
    expect(emptyReport.verdict).toBe('INSUFFICIENT_DATA');
    expect(emptyReport.skillGate.wSkill).toBe(0);
    expect(emptyReport.skillGate.unlocked).toBe(false);
    expect(emptyReport.brierModel).toBeNull();

    const ledger50 = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore());
    seedWellCalibrated(ledger50, 50);
    const report50 = evaluateProspectiveOosReport(ledger50);
    expect(report50.resolvedScoredCount).toBe(50);
    expect(report50.verdict).toBe('INSUFFICIENT_DATA');
    expect(report50.skillGate.wSkill).toBe(0);
    expect(report50.skillGate.reasons).toContain('INSUFFICIENT_RESOLVED_SAMPLES');

    const ledger160 = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore());
    seedWellCalibrated(ledger160, 160);
    const report160 = evaluateProspectiveOosReport(ledger160);
    expect(report160.resolvedScoredCount).toBe(160);
    expect(report160.verdict).toBe('PASS_PROSPECTIVE_SKILL');
    expect(report160.skillGate.unlocked).toBe(true);
    expect(report160.skillGate.wSkill).toBeGreaterThan(0);
    expect(report160.bssOos!).toBeGreaterThan(0.02);
    expect(report160.bssLower95!).toBeGreaterThan(0);
    expect(report160.ece!).toBeLessThan(0.035);

    // 160 poorly calibrated forecasts (high ECE, worse than market)
    const badCalLedger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore());
    for (let i = 0; i < 160; i += 1) {
      const t0 = BASE_MS + i * 1_000;
      const r = submitMarketBlindForecast(badCalLedger, {
        questionId: `q-bad-${i}`, pRaw: 0.90, modelVersion: 'mb-v1', evidence: `Doc ${i}`, committedAtMs: t0,
      });
      attachPostCommitMarketSnapshot(badCalLedger, r, { marketProb: 0.50, marketReadAtMs: t0 + 10 });
      recordMarketBlindResolution(badCalLedger, { entryHash: r.entryHash, status: i % 2 === 0 ? 'RESOLVED_YES' : 'RESOLVED_NO', resolvedAtMs: t0 + 500 });
    }
    const badCalReport = evaluateProspectiveOosReport(badCalLedger);
    expect(badCalReport.verdict).toBe('FAIL_CALIBRATION');
    expect(badCalReport.skillGate.wSkill).toBe(0);
    expect(badCalReport.skillGate.reasons).toContain('EXCESSIVE_ECE');

    // 160 forecasts where first 60 beat market but last 100 (rolling-100) are worse than market
    const rollingLedger = new ProspectivePipelineLedger(createInMemoryAppendOnlyStore());
    seedWellCalibrated(rollingLedger, 60);
    for (let i = 60; i < 160; i += 1) {
      const t0 = BASE_MS + i * 1_000;
      const outcomeYes = i % 2 === 0;
      const r = submitMarketBlindForecast(rollingLedger, {
        questionId: `q-roll-${i}`, pRaw: outcomeYes ? 0.35 : 0.65, modelVersion: 'mb-v1', evidence: `Doc ${i}`, committedAtMs: t0,
      });
      attachPostCommitMarketSnapshot(rollingLedger, r, { marketProb: outcomeYes ? 0.55 : 0.45, marketReadAtMs: t0 + 10 });
      recordMarketBlindResolution(rollingLedger, { entryHash: r.entryHash, status: outcomeYes ? 'RESOLVED_YES' : 'RESOLVED_NO', resolvedAtMs: t0 + 500 });
    }
    const rollingReport = evaluateProspectiveOosReport(rollingLedger);
    expect(rollingReport.verdict).toBe('FAIL_CALIBRATION');
    expect(rollingReport.skillGate.wSkill).toBe(0);
    expect(rollingReport.skillGate.reasons).toContain('ROLLING_100_BRIER_WORSE_THAN_MARKET');
  });
});
