import { describe, it, expect } from 'vitest';
import { FeeGasModel, DEFAULT_FEE_GAS_PROFILES } from '../../../src/desk/sor/fee-gas-model';

describe('FeeGasModel', () => {
  it('loads default fee and gas profiles for all supported venues', () => {
    const model = new FeeGasModel();

    expect(model.getFeeBps('binance', true)).toBe(7.5);
    expect(model.getFeeBps('binance', false)).toBe(2.0);
    expect(model.getGasCostUsd('binance')).toBe(0);

    expect(model.getFeeBps('bybit', true)).toBe(10.0);
    expect(model.getGasCostUsd('bybit')).toBe(0);

    expect(model.getFeeBps('polymarket_clob', true)).toBe(10.0);
    expect(model.getGasCostUsd('polymarket_clob')).toBe(0.05);

    expect(model.getFeeBps('amm_cpmm', true)).toBe(30.0);
    expect(model.getGasCostUsd('amm_cpmm')).toBe(0.05);
  });

  it('allows custom fee and gas overrides', () => {
    const model = new FeeGasModel({
      binance: { takerFeeBps: 5.0, gasCostUsd: 0 },
      amm_cpmm: { gasCostUsd: 0.15 },
    });

    expect(model.getFeeBps('binance', true)).toBe(5.0);
    expect(model.getGasCostUsd('amm_cpmm')).toBe(0.15);
    // Unaltered venues retain defaults
    expect(model.getFeeBps('bybit', true)).toBe(10.0);
  });

  it('calculates fee in USD correctly', () => {
    const model = new FeeGasModel();
    // 10,000 USD notional on Binance taker (7.5 bps) -> $7.50
    const feeBinance = model.calculateFeeUsd('binance', 10000, true);
    expect(feeBinance).toBeCloseTo(7.5, 4);

    // 10,000 USD on AMM (30 bps) -> $30.00
    const feeAmm = model.calculateFeeUsd('amm_cpmm', 10000, true);
    expect(feeAmm).toBeCloseTo(30.0, 4);
  });

  it('adjusts effective price for BUY and SELL with fees and unit gas', () => {
    const model = new FeeGasModel();
    const rawPrice = 100.0;
    const qty = 10.0; // on Polymarket CLOB gas is $0.05 -> unit gas is $0.005

    // BUY: price * (1 + 10/10000) + 0.05/10 = 100 * 1.001 + 0.005 = 100.105
    const effBuy = model.calculateEffectivePrice(rawPrice, 'BUY', 'polymarket_clob', qty, true);
    expect(effBuy).toBeCloseTo(100.105, 4);

    // SELL: price * (1 - 10/10000) - 0.05/10 = 100 * 0.999 - 0.005 = 99.895
    const effSell = model.calculateEffectivePrice(rawPrice, 'SELL', 'polymarket_clob', qty, true);
    expect(effSell).toBeCloseTo(99.895, 4);
  });

  it('evaluates gas hurdles: Delta P * q_v > G_v', () => {
    const model = new FeeGasModel();

    // Gas = $5.00, Delta P = $0.10, Qty = 100 -> $10.00 > $5.00 -> passes
    expect(model.passesGasHurdle(0.10, 100, 5.0)).toBe(true);

    // Gas = $5.00, Delta P = $0.02, Qty = 100 -> $2.00 < $5.00 -> fails
    expect(model.passesGasHurdle(0.02, 100, 5.0)).toBe(false);

    // Zero gas venues always pass
    expect(model.passesGasHurdle(0.0, 10, 0)).toBe(true);
  });

  it('checks isGasHurdleSatisfied for BUY and SELL', () => {
    const model = new FeeGasModel();
    // BUY: Target venue is $99, fallback is $100 -> Delta P = $1.00. Qty = 10, Gas = $5.00 -> savings $10 > $5
    expect(model.isGasHurdleSatisfied(99, 100, 10, 5.0, 'BUY')).toBe(true);

    // BUY: Target venue is $99.80, fallback is $100 -> Delta P = $0.20. Qty = 10, Gas = $5.00 -> savings $2 < $5
    expect(model.isGasHurdleSatisfied(99.80, 100, 10, 5.0, 'BUY')).toBe(false);

    // SELL: Target venue is $102, fallback is $100 -> Delta P = $2.00. Qty = 5, Gas = $5.00 -> savings $10 > $5
    expect(model.isGasHurdleSatisfied(102, 100, 5, 5.0, 'SELL')).toBe(true);
  });
});
