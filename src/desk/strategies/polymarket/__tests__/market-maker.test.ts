import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_CONFIG,
  computeBidPrice,
  computeAskPrice,
  updateSkew,
  computeMakerQuoteEconomicsV2,
} from '../market-maker';
import { runConcentrationCheck } from '../inventory-skew-concentration';
import { runRebalance } from '../inventory-skew-rebalance';

describe('market-maker::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.baseSpread).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.quoteSizeUsdc).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.refreshIntervalMs).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.maxInventorySkew).toBeGreaterThan(0);
  });
});

describe('market-maker::computeBidPrice', () => {
  it('returns fairValue minus half spread at zero skew', () => {
    expect(computeBidPrice(0.5, 0.02, 0, 1)).toBeCloseTo(0.49, 4);
  });
  it('returns fairValue minus half spread at positive skew', () => {
    expect(computeBidPrice(0.5, 0.02, 0.1, 1)).toBeCloseTo(0.49, 4);
  });
});

describe('market-maker::computeAskPrice', () => {
  it('returns fairValue plus half spread at zero skew', () => {
    expect(computeAskPrice(0.5, 0.02, 0, 1)).toBeCloseTo(0.51, 4);
  });
  it('returns fairValue plus half spread at negative skew', () => {
    expect(computeAskPrice(0.5, 0.02, -0.1, 1)).toBeCloseTo(0.51, 4);
  });
});

describe('market-maker::updateSkew', () => {
  it('returns initial skew when no fill (sideFilled=bid)', () => {
    expect(updateSkew(0, 'bid')).toBe(1);
  });
  it('updates skew after filling bid', () => {
    const r = updateSkew(0.1, 'bid');
    expect(r).toBeCloseTo(1.1, 5);
  });
  it('updates skew after filling ask', () => {
    const r = updateSkew(-0.1, 'ask');
    expect(r).toBeCloseTo(-1.1, 5);
  });
  it('returns finite number', () => {
    const r = updateSkew(0.1, 'bid');
    expect(Number.isFinite(r)).toBe(true);
  });
});

describe('market-maker::computeMakerQuoteEconomicsV2', () => {
  it('computes positive maker rebates and avoided taker fees for fee-bearing categories', () => {
    const econ = computeMakerQuoteEconomicsV2(0.49, 0.51, 25, 'crypto');
    expect(econ.category).toBe('crypto');
    expect(econ.bidContracts).toBeCloseTo(25 / 0.49, 4);
    expect(econ.askContracts).toBeCloseTo(25 / 0.51, 4);
    expect(econ.bidRebateUsdc).toBeGreaterThan(0);
    expect(econ.askRebateUsdc).toBeGreaterThan(0);
    expect(econ.avoidedTakerFeeUsdc).toBeGreaterThan(0);
    expect(econ.netMakerEdgeUsdc).toBeGreaterThan(econ.grossSpreadUsdc);
  });

  it('returns zero rebates and zero avoided taker fees for fee-exempt geopolitics category', () => {
    const econ = computeMakerQuoteEconomicsV2(0.49, 0.51, 25, 'geopolitics');
    expect(econ.bidRebateUsdc).toBe(0);
    expect(econ.askRebateUsdc).toBe(0);
    expect(econ.avoidedTakerFeeUsdc).toBe(0);
    expect(econ.netMakerEdgeUsdc).toBeCloseTo(econ.grossSpreadUsdc, 6);
  });
});

describe('inventory-skew CLOB V2 fees', () => {
  it('emits non-zero CLOB V2 quadratic taker fees in runConcentrationCheck and runRebalance', async () => {
    const emitted: Array<{ fees: string }> = [];
    const eventBus = { emit: vi.fn((_e: string, p: { trade: { fees: string } }) => emitted.push(p.trade)) };
    const orderManager = { placeOrder: vi.fn(async () => ({ id: 'o-1' })) };
    const cfg = {
      skewThreshold: 0.2,
      maxConcentrationPct: 0.4,
      trimPct: 0.25,
      minPnlToTrim: 0.01,
      rebalanceIntervalMs: 1000,
      maxTradesPerRebalance: 2,
      positionSize: '10',
    };
    const positions = [
      { tokenId: 't1', side: 'yes' as const, size: 100, entryPrice: 0.4, currentPrice: 0.5, marketId: 'btc-crypto-100k' },
      { tokenId: 't2', side: 'no' as const, size: 10, entryPrice: 0.4, currentPrice: 0.5, marketId: 'eth-crypto-5k' },
    ];
    await runConcentrationCheck({ positions: [...positions.map(p => ({ ...p }))], cfg, orderManager: orderManager as never, eventBus: eventBus as never, now: 5000 });
    await runRebalance({ positions: [...positions.map(p => ({ ...p }))], cfg, orderManager: orderManager as never, eventBus: eventBus as never, now: 5000, lastRebalanceAt: 0 });
    expect(emitted.length).toBeGreaterThanOrEqual(2);
    for (const trade of emitted) {
      expect(Number(trade.fees)).toBeGreaterThan(0);
      expect(trade.fees).not.toBe('0');
    }
  });
});
