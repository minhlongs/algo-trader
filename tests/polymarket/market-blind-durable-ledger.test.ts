import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createInMemoryAppendOnlyStore,
  DurableMarketBlindLedger,
  MarketBlindIntegrityError,
} from '../../src/desk/polymarket/market-blind/market-blind-ledger-store';
import {
  evaluateLedgerSkillStatus,
  ingestResolvedMarketsIntoLedger,
  type GammaResolutionRecord,
} from '../../src/desk/polymarket/market-blind/market-blind-resolution-ingestor';
import { createNodeJsonlAppendStore } from '../../src/desk/polymarket/market-blind/node-market-blind-ledger-adapter';
import { verifySealedForecastReceipt } from '../../src/desk/polymarket/market-blind/market-blind-prospective-ledger';

const tempDirs: string[] = [];

function createTempLedgerPath(nested = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'poly-mb-ledger-'));
  tempDirs.push(dir);
  return nested ? join(dir, 'nested', 'prospective-ledger.jsonl') : join(dir, 'prospective-ledger.jsonl');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('DurableMarketBlindLedger & Node JSONL Adapter', () => {
  it('persists JSONL with 0o600 permissions and hydrates forecasts + resolutions across restart', async () => {
    const filePath = createTempLedgerPath();
    const store = createNodeJsonlAppendStore(filePath);
    const ledger = new DurableMarketBlindLedger(store);

    const r1 = ledger.commitForecast({
      modelVersionId: 'blind-v1',
      stateVariant: 'base',
      questionId: 'q-election-1',
      category: 'politics',
      pRaw: 0.68,
      loggedAtMs: 1_763_500_000_000,
      modelKnowledgeCutoffMs: 1_763_000_000_000,
      eventResolutionOrCutoffMs: 1_764_000_000_000,
      contextHash: 'ctx-hash-1',
    });

    const mktPrice = await ledger.readLiveMarketAfterCommit(r1, () => 0.55, 1_763_500_005_000);
    expect(mktPrice).toBe(0.55);

    ledger.recordResolution({
      receipt: r1,
      marketPriceAtCommit: 0.55,
      marketObservedAtMs: 1_763_500_005_000,
      outcome: 1,
      resolvedAtMs: 1_764_000_100_000,
    });

    const mode = statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);

    // Simulate process restart with fresh store & ledger hydration
    const hydrated = DurableMarketBlindLedger.hydrateFromStore(createNodeJsonlAppendStore(filePath));
    expect(hydrated.recordCount()).toBe(3);
    expect(hydrated.entries()).toHaveLength(1);
    expect(hydrated.resolvedSamples('politics')).toHaveLength(1);
    expect(hydrated.verifyChainIntegrity()).toBe(true);

    const restoredReceipt = hydrated.getReceiptByHash(r1.entryHash)!;
    expect(restoredReceipt.entryHash).toBe(r1.entryHash);
    expect(() => verifySealedForecastReceipt(restoredReceipt)).not.toThrow();
  });

  it('rejects tampered, truncated, and out-of-order JSONL logs on hydration', async () => {
    const filePath = createTempLedgerPath();
    const store = createNodeJsonlAppendStore(filePath);
    const ledger = new DurableMarketBlindLedger(store);

    const r1 = ledger.commitForecast({
      modelVersionId: 'blind-v1',
      stateVariant: 'base',
      questionId: 'q-1',
      category: 'politics',
      pRaw: 0.62,
      loggedAtMs: 1000,
    });
    await ledger.readLiveMarketAfterCommit(r1, () => 0.50, 1100);

    const originalLines = readFileSync(filePath, 'utf8').trimEnd().split('\n');

    // 1) Tampered payload (modify pRaw without updating chain)
    const tamperedPath = createTempLedgerPath(false);
    const tamperedFirst = originalLines[0]!.replace('0.62', '0.91');
    writeFileSync(tamperedPath, `${tamperedFirst}\n${originalLines[1]}\n`, 'utf8');
    expect(() => DurableMarketBlindLedger.hydrateFromStore(createNodeJsonlAppendStore(tamperedPath)))
      .toThrow(MarketBlindIntegrityError);

    // 2) Truncated log (missing seq 0)
    const truncatedPath = createTempLedgerPath(false);
    writeFileSync(truncatedPath, `${originalLines[1]}\n`, 'utf8');
    expect(() => DurableMarketBlindLedger.hydrateFromStore(createNodeJsonlAppendStore(truncatedPath)))
      .toThrow(MarketBlindIntegrityError);

    // 3) Out-of-order swapped lines
    const swappedPath = createTempLedgerPath(false);
    writeFileSync(swappedPath, `${originalLines[1]}\n${originalLines[0]}\n`, 'utf8');
    expect(() => DurableMarketBlindLedger.hydrateFromStore(createNodeJsonlAppendStore(swappedPath)))
      .toThrow(MarketBlindIntegrityError);
  });
});

describe('Resolution Ingestor & OOS Skill Gate Lock', () => {
  function seedForecasts(ledger: DurableMarketBlindLedger, count: number): GammaResolutionRecord[] {
    const resolutions: GammaResolutionRecord[] = [];
    for (let i = 0; i < count; i += 1) {
      // Perfectly calibrated 0.80 / 0.20 buckets (4/5 = 0.80, 1/5 = 0.20) beating 0.55 / 0.45 market
      const highBucket = Math.floor(i / 5) % 2 === 0;
      const pRaw = highBucket ? 0.80 : 0.20;
      const outcome: 0 | 1 = highBucket ? (i % 5 !== 0 ? 1 : 0) : (i % 5 === 0 ? 1 : 0);
      const pMkt = highBucket ? 0.55 : 0.45;
      const loggedAtMs = 1_763_500_000_000 + i * 1000;
      const questionId = `q-oos-${i}`;
      ledger.commitForecast({
        modelVersionId: 'blind-v1',
        stateVariant: 'base',
        questionId,
        category: 'politics',
        pRaw,
        loggedAtMs,
      });
      resolutions.push({
        questionId,
        outcome,
        marketPriceAtCommit: pMkt,
        marketObservedAtMs: loggedAtMs + 100,
        resolvedAtMs: loggedAtMs + 500,
      });
    }
    return resolutions;
  }

  it('keeps w_skill=0 fail-closed when <150 resolved OOS forecasts and is idempotent on re-ingest', () => {
    const ledger = new DurableMarketBlindLedger(createInMemoryAppendOnlyStore());
    const resolutions = seedForecasts(ledger, 149);

    const first = ingestResolvedMarketsIntoLedger(ledger, [
      ...resolutions,
      { questionId: 'q-unknown', outcome: 1, marketPriceAtCommit: 0.5, marketObservedAtMs: 2000, resolvedAtMs: 3000 },
    ]);
    expect(first.ingestedCount).toBe(149);
    expect(first.unmatchedQuestionIds).toEqual(['q-unknown']);
    expect(first.errors).toEqual([]);

    const second = ingestResolvedMarketsIntoLedger(ledger, resolutions);
    expect(second.ingestedCount).toBe(0);
    expect(second.skippedAlreadyResolved).toBe(149);

    const status = evaluateLedgerSkillStatus(ledger, { category: 'politics' });
    expect(status.resolvedCount).toBe(149);
    expect(status.passed).toBe(false);
    expect(status.wSkill).toBe(0);
    expect(status.loggingOnly).toBe(true);
    expect(status.reasons).toContain('INSUFFICIENT_RESOLVED_SAMPLES');
  });

  it('unlocks w_skill > 0 only once >=150 OOS forecasts pass all 5 calibration gates', () => {
    const ledger = new DurableMarketBlindLedger(createInMemoryAppendOnlyStore());
    const resolutions = seedForecasts(ledger, 160);
    const summary = ingestResolvedMarketsIntoLedger(ledger, resolutions);
    expect(summary.ingestedCount).toBe(160);

    const status = evaluateLedgerSkillStatus(ledger, { category: 'politics' });
    expect(status.resolvedCount).toBe(160);
    expect(status.metrics.bssOos).toBeGreaterThan(0.02);
    expect(status.metrics.bssLower95).toBeGreaterThan(0);
    expect(status.metrics.ece).toBeLessThan(0.035);
    expect(status.passed).toBe(true);
    expect(status.wSkill).toBeGreaterThan(0);
    expect(status.loggingOnly).toBe(false);
    expect(status.reasons).toEqual([]);
  });
});
