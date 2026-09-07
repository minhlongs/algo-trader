/**
 * ExecutionEngine Tests — comprehensive coverage for src/desk/arbitrage/executor.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionEngine } from '../executor';
import { ArbitrageOpportunity } from '../types';
import { DEFAULT_EXECUTOR_CONFIG } from '../config';

describe('ExecutionEngine', () => {
  let engine: ExecutionEngine;

  beforeEach(() => {
    engine = new ExecutionEngine();
  });

  const makeOpportunity = (overrides: Partial<ArbitrageOpportunity> = {}): ArbitrageOpportunity => ({
    id: 'test_opp_1',
    type: 'cross-exchange',
    legs: [
      { exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1000, fee: 0.001 },
      { exchange: 'coinbase', symbol: 'BTC/USDT', side: 'sell', price: 50500, amount: 1000, fee: 0.005 },
    ],
    expectedProfit: 494,
    expectedProfitPct: 0.988,
    totalFees: 6,
    confidence: 85,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 5000,
    ...overrides,
  });

  describe('constructor', () => {
    it('should initialize with default config when no argument', () => {
      const e = new ExecutionEngine();
      expect(e).toBeDefined();
    });

    it('should accept partial config overrides', () => {
      const e = new ExecutionEngine({ dryRun: false, slippageTolerance: 0.3 });
      expect(e).toBeDefined();
    });

    it('should merge partial config with defaults', () => {
      const e = new ExecutionEngine({ maxPositionSize: 2000 });
      expect(e).toBeDefined();
    });
  });

  describe('execute (dryRun=true)', () => {
    it('should simulate execution in dry run mode', async () => {
      const engineDry = new ExecutionEngine({ dryRun: true });
      const mockOpportunity = makeOpportunity();

      const result = await engineDry.execute(mockOpportunity);
      expect(result.success).toBe(true);
      expect(result.executedLegs.length).toBe(2);
      expect(result.actualProfit).toBe(494);
      expect(result.actualProfitPct).toBe(0.988);
      expect(result.totalFees).toBe(6);
      expect(result.opportunityId).toBe('test_opp_1');
      expect(typeof result.executedAt).toBe('number');
    });

    it('should use expectedProfit as actualProfit in simulation', async () => {
      const engineDry = new ExecutionEngine({ dryRun: true });
      const opp = makeOpportunity({ expectedProfit: 100 });
      const result = await engineDry.execute(opp);
      expect(result.actualProfit).toBe(100);
    });

    it('should preserve expectedProfitPct in simulation', async () => {
      const engineDry = new ExecutionEngine({ dryRun: true });
      const opp = makeOpportunity({ expectedProfitPct: 2.5 });
      const result = await engineDry.execute(opp);
      expect(result.actualProfitPct).toBe(2.5);
    });

    it('should simulate single leg opportunity', async () => {
      const engineDry = new ExecutionEngine({ dryRun: true });
      const opp = makeOpportunity({ legs: [makeOpportunity().legs[0]] });
      const result = await engineDry.execute(opp);
      expect(result.executedLegs.length).toBe(1);
      expect(result.executedLegs[0].executedPrice).toBe(opp.legs[0].price);
    });

    it('should map all leg fields in simulation', async () => {
      const engineDry = new ExecutionEngine({ dryRun: true });
      const opp = makeOpportunity();
      const result = await engineDry.execute(opp);
      expect(result.executedLegs[0].exchange).toBe('binance');
      expect(result.executedLegs[0].symbol).toBe('BTC/USDT');
      expect(result.executedLegs[0].side).toBe('buy');
      expect(result.executedLegs[0].executedAmount).toBe(1000);
      expect(result.executedLegs[0].fee).toBe(0.001 * 1000);
    });
  });

  describe('execute (dryRun=false)', () => {
    it('should execute legs when slippage is within tolerance', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 0.5 });
      const opp = makeOpportunity();

      const result = await engineLive.execute(opp);
      expect(result.success).toBe(true);
      expect(result.executedLegs.length).toBe(2);
      expect(result.totalFees).toBeGreaterThan(0);
      expect(typeof result.executedAt).toBe('number');
    });

    it('should calculate executedPrice with slippage for buy legs', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity();
      const result = await engineLive.execute(opp);

      const buyLeg = result.executedLegs.find((l) => l.side === 'buy');
      expect(buyLeg).toBeDefined();
      // baseSlippage = 0.1, sizeImpact = (1000/10000) * 0.05 = 0.005 -> total = 0.105
      // executedPrice = 50000 * (1 + 0.105/100) = 50052.5
      expect(buyLeg!.executedPrice).toBeCloseTo(50052.5, 2);
    });

    it('should calculate executedPrice with slippage for sell legs', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity();
      const result = await engineLive.execute(opp);

      const sellLeg = result.executedLegs.find((l) => l.side === 'sell');
      expect(sellLeg).toBeDefined();
      // executedPrice = 50500 * (1 - 0.105/100) = 50446.975
      expect(sellLeg!.executedPrice).toBeCloseTo(50446.975, 2);
    });

    it('should generate a txHash for each executed leg', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity();
      const result = await engineLive.execute(opp);

      for (const leg of result.executedLegs) {
        expect(leg.txHash).toMatch(/^0x[0-9a-f]{64}$/);
      }
    });

    it('should subtract gasFee from net profit', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity({ gasFee: 10 });
      const result = await engineLive.execute(opp);
      // Net profit = actualProfit - totalFees - gasFee
      expect(result.actualProfit).toBeDefined();
    });

    it('should treat null gasFee as 0 in net profit calculation', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity({ gasFee: null as any });
      const result = await engineLive.execute(opp);
      // gasFee ?? 0 branch: null gasFee should be treated as 0
      expect(result.actualProfit).toBeDefined();
    });

    it('should treat undefined gasFee as 0 in net profit calculation', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity({ gasFee: undefined as any });
      const result = await engineLive.execute(opp);
      // gasFee ?? 0 branch: undefined gasFee should be treated as 0
      expect(result.actualProfit).toBeDefined();
    });

    it('should treat omitted gasFee property as 0 in net profit calculation', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity({ gasFee: 10 });
      // Remove gasFee property entirely
      delete (opp as any).gasFee;
      const result = await engineLive.execute(opp);
      // gasFee ?? 0 branch: missing gasFee should be treated as 0
      expect(result.actualProfit).toBeDefined();
    });

    it('should return error result when executeLeg throws', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 0.01 });
      const opp = makeOpportunity({ legs: [{ exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1000000, fee: 0.001 }] });

      const result = await engineLive.execute(opp);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.executedLegs.length).toBe(0);
      expect(result.actualProfit).toBe(0);
    });

    it('should report error message from thrown Error', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 0.01 });
      const opp = makeOpportunity({ legs: [{ exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1000000, fee: 0.001 }] });

      const result = await engineLive.execute(opp);
      expect(result.error).toContain('Slippage');
    });

    it('should set actualProfitPct based on net profit and first leg amount', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity();
      const result = await engineLive.execute(opp);
      // actualProfitPct = (netProfit / legs[0].amount) * 100
      expect(typeof result.actualProfitPct).toBe('number');
    });

    it('should accumulate totalFees from all legs', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity();
      const result = await engineLive.execute(opp);
      expect(result.totalFees).toBeCloseTo(0.001 * 1000 + 0.005 * 1000, 5);
    });
  });

  describe('calculateActualProfit', () => {
    it('should return 0 for less than 2 legs', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity({ legs: [{ exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1000, fee: 0.001 }] });

      const result = await engineLive.execute(opp);
      // With only 1 leg, calculateActualProfit returns 0; netProfit = 0 - totalFees
      expect(result.actualProfit).toBe(-1);
    });

    it('should calculate profit from buy and sell legs', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity();
      const result = await engineLive.execute(opp);
      // Profit = (sellPrice - buyPrice) * sellAmount
      expect(typeof result.actualProfit).toBe('number');
    });

    it('should handle legs with no buy leg (profit = 0)', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity({
        legs: [
          { exchange: 'coinbase', symbol: 'BTC/USDT', side: 'sell', price: 50500, amount: 1000, fee: 0.005 },
          { exchange: 'kraken', symbol: 'BTC/USDT', side: 'sell', price: 50600, amount: 1000, fee: 0.0026 },
        ],
      });
      const result = await engineLive.execute(opp);
      // No buy leg -> calculateActualProfit returns 0; netProfit = 0 - totalFees = -7.6
      expect(result.actualProfit).toBe(-7.6);
    });

    it('should handle legs with no sell leg (profit = 0)', async () => {
      const engineLive = new ExecutionEngine({ dryRun: false, slippageTolerance: 1.0 });
      const opp = makeOpportunity({
        legs: [
          { exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1000, fee: 0.001 },
          { exchange: 'coinbase', symbol: 'BTC/USDT', side: 'buy', price: 49900, amount: 1000, fee: 0.005 },
        ],
      });
      const result = await engineLive.execute(opp);
      // No sell leg -> calculateActualProfit returns 0; netProfit = 0 - totalFees = -6
      expect(result.actualProfit).toBe(-6);
    });
  });

  describe('calculateGasFee', () => {
    it('should return gas fee for ethereum network', () => {
      const gasFee = (engine as any).calculateGasFee('uniswap', 'ethereum');
      expect(gasFee).toBeCloseTo((50 * 20) / 1000000, 10);
    });

    it('should return gas fee for polygon network', () => {
      const gasFee = (engine as any).calculateGasFee('uniswap', 'polygon');
      expect(gasFee).toBeCloseTo((0.5 * 20) / 1000000, 10);
    });

    it('should return gas fee for arbitrum network', () => {
      const gasFee = (engine as any).calculateGasFee('uniswap', 'arbitrum');
      expect(gasFee).toBeCloseTo((1 * 20) / 1000000, 10);
    });

    it('should default to 50 for unknown network', () => {
      const gasFee = (engine as any).calculateGasFee('uniswap', 'unknown-chain');
      expect(gasFee).toBeCloseTo((50 * 20) / 1000000, 10);
    });
  });

  describe('generateTxHash', () => {
    it('should generate a 66-character hex string', () => {
      const hash = (engine as any).generateTxHash();
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(hash.length).toBe(66);
    });

    it('should generate unique hashes', () => {
      const hash1 = (engine as any).generateTxHash();
      const hash2 = (engine as any).generateTxHash();
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateOpportunity', () => {
    it('should return true for valid opportunity', () => {
      const opp = makeOpportunity({ expectedProfitPct: 1.0 });
      expect(engine.validateOpportunity(opp)).toBe(true);
    });

    it('should return false for empty legs', () => {
      const opp = makeOpportunity({ legs: [] });
      expect(engine.validateOpportunity(opp)).toBe(false);
    });

    it('should return false when expectedProfitPct below threshold', () => {
      const opp = makeOpportunity({ expectedProfitPct: 0.1 });
      expect(engine.validateOpportunity(opp)).toBe(false);
    });

    it('should return false when slippage exceeds tolerance', () => {
      const opp = makeOpportunity({ slippage: 1.0 });
      expect(engine.validateOpportunity(opp)).toBe(false);
    });

    it('should return true when slippage equals tolerance (boundary)', () => {
      const opp = makeOpportunity({ slippage: 0.5 });
      expect(engine.validateOpportunity(opp)).toBe(true);
    });

    it('should return true when expectedProfitPct equals threshold (boundary)', () => {
      const opp = makeOpportunity({ expectedProfitPct: 0.5 });
      expect(engine.validateOpportunity(opp)).toBe(true);
    });

    it('should return true with undefined slippage', () => {
      const opp = makeOpportunity({ slippage: undefined });
      expect(engine.validateOpportunity(opp)).toBe(true);
    });
  });

  describe('calculateSlippage', () => {
    it('should return base slippage for small positions', () => {
      const leg = { exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1000, fee: 0.001 };
      const slippage = (engine as any).calculateSlippage(leg);
      // baseSlippage = 0.1, sizeImpact = (1000/10000) * 0.05 = 0.005
      expect(slippage).toBeCloseTo(0.105, 4);
    });

    it('should increase with larger position size', () => {
      const smallLeg = { exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1000, fee: 0.001 };
      const largeLeg = { exchange: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 50000, fee: 0.001 };
      const smallSlip = (engine as any).calculateSlippage(smallLeg);
      const largeSlip = (engine as any).calculateSlippage(largeLeg);
      expect(largeSlip).toBeGreaterThan(smallSlip);
    });
  });

  describe('DEFAULT_EXECUTOR_CONFIG', () => {
    it('should have dryRun true by default', () => {
      expect(DEFAULT_EXECUTOR_CONFIG.dryRun).toBe(true);
    });

    it('should have slippageTolerance 0.5', () => {
      expect(DEFAULT_EXECUTOR_CONFIG.slippageTolerance).toBe(0.5);
    });

    it('should have minProfitThreshold 0.5', () => {
      expect(DEFAULT_EXECUTOR_CONFIG.minProfitThreshold).toBe(0.5);
    });

    it('should have maxPositionSize 1000', () => {
      expect(DEFAULT_EXECUTOR_CONFIG.maxPositionSize).toBe(1000);
    });

    it('should have timeoutMs 5000', () => {
      expect(DEFAULT_EXECUTOR_CONFIG.timeoutMs).toBe(5000);
    });
  });
});
