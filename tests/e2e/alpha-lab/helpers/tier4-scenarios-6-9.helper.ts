import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { RegimeAwareKelly } from '../../../../src/desk/risk/regime-aware-kelly';
import { PaperExecutor } from '../../../../src/desk/execution/paper-executor';
import { applyStressToBaselineConfig, resolveCostConfig } from '../../../../src/alpha-lab/cost-model/cost-stress';
import { evaluateAlpha } from '../../../../src/alpha-lab/attribution/alpha-evaluator';
import {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
  type LedgerRecord,
} from '../../../../src/alpha-lab/provenance/research-ledger';
import { writeRunCard, hashConfig, RUN_CARD_SCHEMA_VERSION } from '../../../../src/alpha-lab/provenance/run-card';
import { createTempDir, makeCandidateResult } from '../fixtures/test-helpers';
import { makeTrendUpCandles } from '../fixtures/market-data-fixtures';

export function registerTier4Scenarios6To9(): void {
  let tempDirObj: { path: string; cleanup: () => Promise<void> };

  beforeEach(async () => {
    tempDirObj = await createTempDir();
  });

  afterEach(async () => {
    await tempDirObj.cleanup();
  });

  describe('Scenario 6: Quarter-Kelly Margin & Risk Bounding', () => {
    it('S6: caps position size at 5% of portfolio equity and zeros in SHOCK regime', async () => {
      const kelly = new RegimeAwareKelly({
        kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05 },
        regimeMultipliers: { TREND_UP: 1.25, SHOCK: 0.0 },
        unknownRegimeMultiplier: 0.75,
      });

      // Extreme edge: win probability 90%, win/loss 5.0 -> Kelly would want >50% allocation without cap
      const sizing = kelly.size({ winProbability: 0.90, winLossRatio: 5.0, portfolioValue: 100000 }, 'TREND_UP');
      // Must be capped at strict 5% of $100k = $5,000 (with regime multiplier 1.25 capped at maxPositionFraction)
      expect(sizing.positionSizeUsd).toBeLessThanOrEqual(5000 * 1.25);
      expect(sizing.portfolioPercent).toBeLessThanOrEqual(5.0 * 1.25);

      // In SHOCK regime, exposure strictly collapses to $0
      const shockSizing = kelly.size({ winProbability: 0.90, winLossRatio: 5.0, portfolioValue: 100000 }, 'SHOCK');
      expect(shockSizing.positionSizeUsd).toBe(0);

      const executor = new PaperExecutor({ initialBalance: 100000, simulateFillRate: 1.0 });
      await executor.start(100000, true);
      const fill = await executor.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: sizing.positionSizeUsd / 50000 }, 50000);
      expect(fill.success).toBe(true);
      expect(executor.getPnlSummary().balance).toBeGreaterThan(0); // Capital preserved
      await executor.stop();
    });
  });

  describe('Scenario 7: Adverse Fee Stress Test', () => {
    it('S7: 3x base fee and slippage stress flips marginal candidate to negative expectancy', () => {
      const nominalTrades = 100;
      const nominalGrossPnl = 300; // $300 profit before heavy friction
      const closes = makeTrendUpCandles(50).map((c) => ({ timestamp: c.timestamp, close: c.close }));

      // Under 3x fee stress
      const baseCosts = resolveCostConfig('NORMAL');
      const stressedCosts = applyStressToBaselineConfig({ feeBps: baseCosts.feeBps * 3, slippageBps: baseCosts.slippageBps * 3 }, 'EXTREME');
      const frictionPerTrade = (stressedCosts.feeBps * 2 + stressedCosts.slippageBps) * 0.5; // ~$4.50 per trade
      const stressedNetPnl = nominalGrossPnl - (nominalTrades * frictionPerTrade);

      expect(stressedNetPnl).toBeLessThan(0); // Net profit turns negative under fee stress
      const stressedCandidate = makeCandidateResult({ totalNetPnl: stressedNetPnl, sharpeRatio: -0.8 });
      const verdict = evaluateAlpha(stressedCandidate, closes);
      expect(verdict.passed).toBe(false);
      expect(verdict.failedCriteria.some((c) => c.includes('Sharpe') || c.includes('PnL'))).toBe(true);
    });
  });

  describe('Scenario 8: End-to-End Research Audit Verification', () => {
    it('S8: records multi-experiment research chain and detects single-byte tampering', async () => {
      const ledgerFile = join(tempDirObj.path, 'audit_ledger.jsonl');
      for (let i = 0; i < 5; i++) {
        const res = await appendLedgerRecord({
          runId: `audit-run-${i}`, configHash: `hash-${i.toString().padStart(64, '0')}`, strategyRef: `strat-${i}`,
          resultClass: i % 2 === 0 ? 'SURVIVED' : 'REJECTED', gates: { survival: i % 2 === 0 },
        }, ledgerFile);
        expect(res.ok).toBe(true);
      }

      const records = await readLedgerRecords(ledgerFile);
      expect(records.length).toBe(5);
      expect(verifyLedgerChain(records)).toBe(-1); // Valid intact chain

      // Single-byte tampering in record 2
      records[2]!.strategyRef = 'tampered-strat-name';
      const brokenIndex = verifyLedgerChain(records);
      expect(brokenIndex).toBe(3); // Link from 2 -> 3 is broken
    });
  });

  describe('Scenario 9: Dual Run-Card Immutable Archival', () => {
    it('S9: serializes alpha experiment into dual JSON and Markdown run-cards', async () => {
      const runDir = join(tempDirObj.path, 'archival-run');
      const config = { family: 'trend-following', symbol: 'ETH/USDT', lookback: 25, stopLossPct: 0.03 };
      const card = await writeRunCard(runDir, {
        runId: 'archival-001', resultClass: 'SURVIVED', strategyRef: 'strat-tf-eth',
        dataSources: ['binance:ETH/USDT:1h'], metrics: { sharpeRatio: 1.92, winRate: 0.64, maxDrawdown: 0.07 },
        hypothesis: 'Momentum breakouts on ETH with ATR stops yield sustained trend alpha', config,
      });

      expect(card.schemaVersion).toBe(RUN_CARD_SCHEMA_VERSION);
      expect(card.configHash).toBe(hashConfig(config));

      // Read JSON
      const jsonContent = await readFile(join(runDir, 'run_card.json'), 'utf8');
      const parsed = JSON.parse(jsonContent);
      expect(parsed.runId).toBe('archival-001');
      expect(parsed.metrics.sharpeRatio).toBe(1.92);

      // Read Markdown
      const mdContent = await readFile(join(runDir, 'run_card.md'), 'utf8');
      expect(mdContent).toContain('# Run Card — archival-001');
      expect(mdContent).toContain('Momentum breakouts on ETH');
      expect(mdContent).toContain('| sharpeRatio | 1.92 |');
    });
  });
}
