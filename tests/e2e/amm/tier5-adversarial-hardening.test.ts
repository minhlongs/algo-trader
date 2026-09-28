/**
 * Tier 5: Adversarial Hardening Test Suite
 * Prediction Market AMM & Negative-Risk Arbitrage Engine
 *
 * Implements >= 10 adversarial security, cryptographic integrity, and extreme edge tests:
 * ADV1. Single-byte HMAC tampering detection in audit record hash
 * ADV2. Single-byte payload mutation tampering detection in details
 * ADV3. Corrupted sequence number injection (index skipping)
 * ADV4. Truncated audit chain attack (missing intermediate or genesis records)
 * ADV5. Non-monotonic timestamp tampering injection (backdating attacks)
 * ADV6. Micro-trade rounding stress & numerical cancellation test (log1p/expm1 precision)
 * ADV7. Extreme log-sum-exp overflow stress with numbers up to 1e15
 * ADV8. Deep negative underflow stress (-1e15)
 * ADV9. Concurrent multi-leg race condition / simultaneous conflicting execution simulation
 * ADV10. Adversarial negative / zero liquidity parameter b rejection
 * ADV11. Zero-division and NaN guard under all-zero reserve inputs in CPMM
 * ADV12. High-frequency replay attack resistance in audit logger
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LmsrPricing,
  DynamicBAdapter,
  CpmmPricing,
  MultiTokenPool,
  CombinatorialScanner,
  BasketPricer,
  AtomicBasketCoordinator,
  CompensatoryUnwindHandler,
  TwoSidedQuoter,
  InventoryDeltaRebalancer,
  AdverseSelectionGuard,
  AmmRiskGuard,
  AmmMetricsRecorder,
  AmmAuditLogger,
  MasterAmmEngine,
  createMockMarket,
  createMockOrderbooks,
  createDefaultRiskContext,
  createDefaultPoolConfig,
} from './fixtures/amm-test-harness';
import type {
  CpmmReserves,
  DynamicBConfig,
  DynamicBState,
  TradeIntent,
  MarketState,
  InventoryState,
} from './fixtures/amm-test-harness';

describe('Tier 5: Adversarial Hardening & Cryptographic Integrity', () => {
  // ─── ADV1: Single-Byte HMAC Tampering Detection ────────────────────────────
  it('ADV1: detects single-byte bit flip in audit record HMAC hash and pins exact index', () => {
    const logger = new AmmAuditLogger('sec-adv-1');
    for (let i = 0; i < 20; i++) {
      logger.logEvent('TRADE_EXECUTED', { tradeId: i, notional: 100 * i });
    }

    expect(logger.verifyChain().valid).toBe(true);

    const chain = logger.getChain() as Array<{
      index: number;
      timestamp: number;
      action: string;
      details: Record<string, unknown>;
      prevHash: string;
      hash: string;
    }>;

    // Flip 1 character in record 11's hash
    const targetIdx = 11;
    const originalHash = chain[targetIdx].hash;
    const alteredHash = (originalHash[0] === 'f' ? 'e' : 'f') + originalHash.slice(1);
    chain[targetIdx].hash = alteredHash;

    const check = logger.verifyChain();
    expect(check.valid).toBe(false);
    expect(check.failedIndex).toBe(targetIdx);
    expect(check.reason).toMatch(/corruption/i);

    // Restore
    chain[targetIdx].hash = originalHash;
    expect(logger.verifyChain().valid).toBe(true);
  });

  // ─── ADV2: Single-Byte Payload Mutation Tampering Detection ────────────────
  it('ADV2: detects payload mutation in details object while hash remains unchanged', () => {
    const logger = new AmmAuditLogger('sec-adv-2');
    for (let i = 0; i < 15; i++) {
      logger.logEvent('RISK_GATE_APPROVED', { intentId: `intent-${i}`, amountUsd: 500 });
    }

    const chain = logger.getChain() as Array<{
      index: number;
      timestamp: number;
      action: string;
      details: Record<string, unknown>;
      prevHash: string;
      hash: string;
    }>;

    // Attacker modifies authorized amount from 500 to 50,000 in index 7
    chain[7].details.amountUsd = 50_000;

    const check = logger.verifyChain();
    expect(check.valid).toBe(false);
    expect(check.failedIndex).toBe(7);
    expect(check.reason).toMatch(/corruption/i);

    // Revert modification
    chain[7].details.amountUsd = 500;
    expect(logger.verifyChain().valid).toBe(true);
  });

  // ─── ADV3: Corrupted Sequence Number Injection ─────────────────────────────
  it('ADV3: detects corrupted sequence numbers when an intermediate record index is skipped', () => {
    const logger = new AmmAuditLogger('sec-adv-3');
    for (let i = 0; i < 10; i++) {
      logger.logEvent('TRADE_EXECUTED', { step: i });
    }

    const chain = logger.getChain() as Array<{
      index: number;
      timestamp: number;
      action: string;
      details: Record<string, unknown>;
      prevHash: string;
      hash: string;
    }>;

    // Tamper index: 4 -> 5 -> 7 (skipping 6)
    const originalIndex = chain[6].index;
    chain[6].index = 7;

    const check = logger.verifyChain();
    expect(check.valid).toBe(false);
    expect(check.failedIndex).toBe(6);
    expect(check.reason).toMatch(/non-contiguous index/i);

    chain[6].index = originalIndex;
    expect(logger.verifyChain().valid).toBe(true);
  });

  // ─── ADV4: Truncated Audit Chain Attack ────────────────────────────────────
  it('ADV4: detects deletion of genesis or intermediate records breaking prevHash links', () => {
    const logger = new AmmAuditLogger('sec-adv-4');
    for (let i = 0; i < 10; i++) {
      logger.logEvent('TRADE_EXECUTED', { trade: i });
    }

    const rawChain = logger.getChain() as unknown as Array<{
      index: number;
      timestamp: number;
      action: string;
      details: Record<string, unknown>;
      prevHash: string;
      hash: string;
    }>;

    // Delete record 3 (splicing it out)
    const removed = rawChain.splice(3, 1)[0];

    const check = logger.verifyChain();
    expect(check.valid).toBe(false);
    expect(check.failedIndex).toBe(3);

    // Restore record
    rawChain.splice(3, 0, removed);
    expect(logger.verifyChain().valid).toBe(true);
  });

  // ─── ADV5: Non-Monotonic Timestamp Tampering Injection ─────────────────────
  it('ADV5: detects retroactively injected backdated event failing monotonic sequence', () => {
    const logger = new AmmAuditLogger('sec-adv-5');
    logger.logEvent('POOL_INITIALIZED', { id: 'p1' });
    logger.logEvent('TRADE_EXECUTED', { vol: 100 });
    logger.logEvent('TRADE_EXECUTED', { vol: 200 });

    const chain = logger.getChain() as Array<{
      index: number;
      timestamp: number;
      action: string;
      details: Record<string, unknown>;
      prevHash: string;
      hash: string;
    }>;

    // Forge backdated timestamp on record 2 (set timestamp older than record 1)
    const originalTimestamp = chain[2].timestamp;
    chain[2].timestamp = chain[1].timestamp - 1000;
    // Recompute hash for record 2 so HMAC itself would pass, but monotonic check catches it
    chain[2].hash = logger.computeRecordHash(
      chain[2].prevHash,
      chain[2].index,
      chain[2].timestamp,
      'TRADE_EXECUTED',
      chain[2].details
    );

    const check = logger.verifyChain();
    expect(check.valid).toBe(false);
    expect(check.failedIndex).toBe(2);
    expect(check.reason).toMatch(/non-monotonic timestamp/i);

    chain[2].timestamp = originalTimestamp;
    chain[2].hash = logger.computeRecordHash(
      chain[2].prevHash,
      chain[2].index,
      chain[2].timestamp,
      'TRADE_EXECUTED',
      chain[2].details
    );
    expect(logger.verifyChain().valid).toBe(true);
  });

  // ─── ADV6: Micro-Trade Precision & Numerical Cancellation Stress ────────────
  it('ADV6: computes micro-trade trade cost down to 1e-15 without cancellation or underflow', () => {
    const shares = [1_000, 1_000];
    const b = 5_000;

    // Test a ladder of tiny micro-trade quantities: 1e-6, 1e-9, 1e-12, 1e-15
    const deltas = [1e-6, 1e-9, 1e-12, 1e-15];

    for (const d of deltas) {
      const cost = LmsrPricing.calculateTradeCost(shares, [d, 0], b);
      expect(Number.isFinite(cost)).toBe(true);
      expect(cost).toBeGreaterThan(0);
      // Marginal price is 0.5, so cost should be strictly close to 0.5 * d
      expect(cost / d).toBeCloseTo(0.5, 4);
    }
  });

  // ─── ADV7: Extreme Log-Sum-Exp Overflow Stress (1e15) ──────────────────────
  it('ADV7: handles extreme shares vector [1e15, 1e14, 0] with b=10 without Infinity or NaN', () => {
    const shares = [1e15, 1e14, 0];
    const b = 10;

    const prices = LmsrPricing.calculateSpotPrices(shares, b);
    expect(prices).toHaveLength(3);
    expect(Number.isFinite(prices[0])).toBe(true);
    expect(prices[0]).toBeCloseTo(1.0, 10);
    expect(prices[1]).toBe(0);
    expect(prices[2]).toBe(0);
    expect(prices.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 10);

    const cost = LmsrPricing.calculateCost(shares, b);
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeGreaterThan(0);
  });

  // ─── ADV8: Deep Negative Underflow Stress (-1e15) ───────────────────────────
  it('ADV8: handles extreme negative shares vector [-1e15, -1e15, 0] without crash', () => {
    const shares = [-1e15, -1e15, 0];
    const b = 100;

    const prices = LmsrPricing.calculateSpotPrices(shares, b);
    expect(prices[2]).toBeCloseTo(1.0, 10);
    expect(prices[0]).toBe(0);
    expect(prices[1]).toBe(0);
    expect(prices.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 10);

    const cost = LmsrPricing.calculateCost(shares, b);
    expect(Number.isFinite(cost)).toBe(true);
  });

  // ─── ADV9: Simultaneous Concurrent Trade Race Simulation ────────────────────
  it('ADV9: concurrent trade requests on pool maintain exact state consistency and positive balances', async () => {
    const pool = new MultiTokenPool(createDefaultPoolConfig(2));
    pool.mintCompleteSet(10_000);

    // Simulate 20 concurrent trades executed via Promise.all
    const tradePromises = Array.from({ length: 20 }, (_, i) => {
      const outcome = i % 2 === 0 ? 'OUT_1' : 'OUT_2';
      return Promise.resolve().then(() =>
        pool.executeTrade({
          poolId: pool.getPoolId(),
          outcomeId: outcome,
          sharesDelta: 10,
        })
      );
    });

    const results = await Promise.all(tradePromises);
    expect(results).toHaveLength(20);
    expect(pool.getTradeCount()).toBe(20);
    expect(pool.getCollateral()).toBeGreaterThan(10_000);

    // Invariant: spot prices sum to 1.0 after all concurrent trades
    const finalPrices = LmsrPricing.calculateSpotPrices(pool.getShares(), pool.getB());
    expect(finalPrices.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 10);
  });

  // ─── ADV10: Adversarial Negative / Zero Liquidity Parameter b Rejection ────
  it('ADV10: strictly rejects negative, zero, and NaN liquidity parameter b', () => {
    const shares = [100, 100];

    expect(() => LmsrPricing.calculateCost(shares, 0)).toThrow(/strictly positive/i);
    expect(() => LmsrPricing.calculateCost(shares, -100)).toThrow(/strictly positive/i);
    expect(() => LmsrPricing.calculateCost(shares, NaN)).toThrow(/strictly positive/i);

    expect(() => LmsrPricing.calculateSpotPrices(shares, 0)).toThrow(/strictly positive/i);
    expect(() => LmsrPricing.calculateSpotPrices(shares, -50)).toThrow(/strictly positive/i);

    expect(() => LmsrPricing.calculateTradeCost(shares, [10, 0], 0)).toThrow(/strictly positive/i);
  });

  // ─── ADV11: Zero-Division and NaN Guard under Zero Reserves in CPMM ────────
  it('ADV11: CPMM zero reserve inputs throw validation errors preventing NaN corruption', () => {
    const zeroReserves: CpmmReserves = { yesShares: 0, noShares: 1000, collateralReserve: 1000 };
    expect(() => CpmmPricing.calculateSwap('YES', 100, zeroReserves, 30)).toThrow(/strictly positive/i);

    const zeroReservesBoth: CpmmReserves = { yesShares: 0, noShares: 0, collateralReserve: 0 };
    const spot = CpmmPricing.calculateSpotPrices(zeroReservesBoth);
    expect(spot.spotPriceYes).toBe(0.5);
    expect(spot.spotPriceNo).toBe(0.5);
  });

  // ─── ADV12: High-Frequency Replay Resistance in Audit Logger ───────────────
  it('ADV12: identical consecutive event payloads produce unique hashes and sequential indices', () => {
    const logger = new AmmAuditLogger('sec-adv-12');
    const identicalPayload = { action: 'HEARTBEAT', status: 'OK' };

    const r1 = logger.logEvent('POOL_INITIALIZED', identicalPayload);
    const r2 = logger.logEvent('POOL_INITIALIZED', identicalPayload);
    const r3 = logger.logEvent('POOL_INITIALIZED', identicalPayload);

    expect(r1.index).toBe(0);
    expect(r2.index).toBe(1);
    expect(r3.index).toBe(2);

    // Cryptographic hashes must be distinct due to hash chaining
    expect(r1.hash).not.toBe(r2.hash);
    expect(r2.hash).not.toBe(r3.hash);
    expect(logger.verifyChain().valid).toBe(true);
  });
});
