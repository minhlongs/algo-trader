import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { LiveExecutionGuard } from '../../../../src/desk/execution/live-execution-guard-core';
import type { PolymarketOrder } from '../../../../src/desk/execution/polymarket-signer';
import {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
} from '../../../../src/alpha-lab/provenance/research-ledger';
import { writeRunCard, hashConfig } from '../../../../src/alpha-lab/provenance/run-card';
import { createTempDir } from '../fixtures/test-helpers';

export function registerTier3RiskProvenanceTests(): void {
  let tempDirObj: { path: string; cleanup: () => Promise<void> };

  beforeEach(async () => {
    tempDirObj = await createTempDir();
  });

  afterEach(async () => {
    await tempDirObj.cleanup();
  });

  describe('Pairwise Track 4: Promoted Alpha -> LiveExecutionGuard Pre-Trade Risk Verification (R3 -> R3)', () => {
    const validLiveOrder: PolymarketOrder = {
      orderId: 'live-order-1', tokenID: '0x1234567890abcdef', price: 0.55, size: 1500, side: 'BUY', nonce: 101, expiration: Math.floor(Date.now() / 1000) + 3600,
    };

    it('P4.1: live order conforming to position limits passes LiveExecutionGuard', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true });
      const verdict = guard.guardOrder(validLiveOrder);
      expect(verdict.approved).toBe(true);
      expect(verdict.checks.circuitBreakerOk).toBe(true);
      expect(verdict.checks.positionSizeOk).toBe(true);
    });

    it('P4.2: order exceeding 2% position limit ($2,500 on $100k capital) is rejected by LiveExecutionGuard', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true });
      const oversizedOrder: PolymarketOrder = { ...validLiveOrder, size: 5000 };
      const verdict = guard.guardOrder(oversizedOrder);
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.positionSizeOk).toBe(false);
      expect(verdict.reason).toContain('exceeds max position');
    });

    it('P4.3: consecutive losses trip circuit breaker, instantly terminating order approval', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true, maxConsecutiveLosses: 2 });
      guard.recordLoss(-100);
      expect(guard.getStatus().circuitTripped).toBe(false);
      guard.recordLoss(-150);
      expect(guard.getStatus().circuitTripped).toBe(true);
      const verdict = guard.guardOrder(validLiveOrder);
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.circuitBreakerOk).toBe(false);
    });

    it('P4.4: accumulated daily loss reaching $5,000 threshold halts trading until resetDaily', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true, maxDailyDrawdown: 0.05 });
      guard.recordLoss(-4800);
      expect(guard.guardOrder(validLiveOrder).approved).toBe(true);
      guard.recordLoss(-300);
      expect(guard.guardOrder(validLiveOrder).approved).toBe(false);
      guard.resetDaily();
      expect(guard.guardOrder(validLiveOrder).approved).toBe(true);
    });
  });

  describe('Pairwise Track 5: Pipeline Transitions -> SHA-256 Ledger & Run Card (R4 -> R4)', () => {
    it('P5.1: writes run card with deterministic SHA-256 configuration hash verified by hashConfig', async () => {
      const runDir = join(tempDirObj.path, 'e2e-run-card');
      const testConfig = { symbol: 'BTC/USDT', lookback: 20, threshold: 0.05, subParams: { alpha: 1.5, beta: 0.8 } };
      const expectedHash = hashConfig(testConfig);
      expect(expectedHash).toHaveLength(64);

      const card = await writeRunCard(runDir, {
        runId: 'pairwise-run-001', resultClass: 'SURVIVED', strategyRef: 'strat-momentum-breakout',
        dataSources: ['binance:BTC/USDT:1h'], metrics: { sharpeRatio: 1.85, winRate: 0.63, maxDrawdown: 0.07 }, config: testConfig,
      });
      expect(card.configHash).toBe(expectedHash);
      const jsonStr = await readFile(join(runDir, 'run_card.json'), 'utf8');
      expect(JSON.parse(jsonStr).configHash).toBe(expectedHash);
    });

    it('P5.2: multi-milestone pipeline records appended to ResearchLedger form valid SHA-256 cryptographic chain', async () => {
      const ledgerFile = join(tempDirObj.path, 'pipeline_research.jsonl');
      const r1 = await appendLedgerRecord({ runId: 'm1', configHash: 'h1', strategyRef: 'strat', resultClass: 'DISCOVERED', gates: { g1: true } }, ledgerFile);
      const r2 = await appendLedgerRecord({ runId: 'm2', configHash: 'h2', strategyRef: 'strat', resultClass: 'PAPER_QUALIFIED', gates: { g2: true } }, ledgerFile);
      const r3 = await appendLedgerRecord({ runId: 'm3', configHash: 'h3', strategyRef: 'strat', resultClass: 'LIVE_PROMOTED', gates: { g3: true } }, ledgerFile);
      expect(r1.ok && r2.ok && r3.ok).toBe(true);
      const allRecords = await readLedgerRecords(ledgerFile);
      expect(allRecords.length).toBe(3);
      expect(verifyLedgerChain(allRecords)).toBe(-1);
    });

    it('P5.3: ledger tampering in an intermediate pipeline record is detected by verifyLedgerChain', async () => {
      const ledgerFile = join(tempDirObj.path, 'tampered_ledger.jsonl');
      await appendLedgerRecord({ runId: 'm1', configHash: 'h1', strategyRef: 's1', resultClass: 'DISCOVERED', gates: {} }, ledgerFile);
      await appendLedgerRecord({ runId: 'm2', configHash: 'h2', strategyRef: 's1', resultClass: 'PAPER_APPROVED', gates: {} }, ledgerFile);
      await appendLedgerRecord({ runId: 'm3', configHash: 'h3', strategyRef: 's1', resultClass: 'LIVE_APPROVED', gates: {} }, ledgerFile);
      const records = await readLedgerRecords(ledgerFile);
      records[1]!.strategyRef = 'tampered-strategy';
      expect(verifyLedgerChain(records)).toBe(2);
    });

    it('P5.4: provenance mapping connects run card configHash to ledger entry', async () => {
      const runDir = join(tempDirObj.path, 'provenance-run');
      const ledgerFile = join(tempDirObj.path, 'provenance_ledger.jsonl');
      const config = { family: 'mean-reversion', symbol: 'BTC/USDT', lookback: 30 };
      const configHash = hashConfig(config);

      const card = await writeRunCard(runDir, {
        runId: 'prov-001', resultClass: 'SURVIVED', strategyRef: 'strat-mr-30', dataSources: ['binance:BTC/USDT'], metrics: { winRate: 0.65 }, config,
      });

      const appendRes = await appendLedgerRecord({
        runId: card.runId, configHash: card.configHash, strategyRef: card.strategyRef, resultClass: card.resultClass, gates: { survival: true },
      }, ledgerFile);

      expect(card.configHash).toBe(configHash);
      expect(appendRes.ok).toBe(true);
      if (appendRes.ok) {
        expect(appendRes.record.runId).toBe(card.runId);
      }
    });
  });
}
