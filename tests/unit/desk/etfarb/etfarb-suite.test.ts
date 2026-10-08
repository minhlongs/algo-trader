import { describe, it, expect } from 'vitest';
import { InavBasketCalculator } from '../../../../src/desk/etfarb/inav-basket-calculator';
import { EtfArbitrageEngine } from '../../../../src/desk/etfarb/etf-arbitrage-engine';
import { EtfBasket } from '../../../../src/desk/etfarb/etfarb-types';

describe('ETF Creation/Redemption & Index Arbitrage Desk Suite', () => {
  const mockBasket: EtfBasket = {
    etfSymbol: 'SPY_SYNTH',
    creationUnitSizeShares: 50000,
    cashComponentUsd: 100000,
    constituents: [
      { symbol: 'AAPL', sharesPerCreationUnit: 1000, lastPriceUsd: 200 }, // $200k
      { symbol: 'MSFT', sharesPerCreationUnit: 800, lastPriceUsd: 400 },  // $320k
      { symbol: 'NVDA', sharesPerCreationUnit: 3000, lastPriceUsd: 120 }, // $360k
    ],
  };

  it('computes basket value and iNAV per share accurately', () => {
    const calculator = new InavBasketCalculator();
    const res = calculator.computeInav(mockBasket);

    // Total basket = 200k + 320k + 360k + 100k cash = $980,000
    // iNAV per share = 980,000 / 50,000 = $19.60
    expect(res.totalBasketValueUsd).toBe(980000);
    expect(res.inavPerShareUsd).toBe(19.60);
    expect(res.creationUnitSizeShares).toBe(50000);
  });

  it('generates CREATE_AND_SELL_ETF signal when market price exceeds iNAV by more than hurdle', () => {
    const calculator = new InavBasketCalculator();
    const inav = calculator.computeInav(mockBasket);

    const engine = new EtfArbitrageEngine();
    // Market price $19.80 vs iNAV $19.60 -> Premium ~ +102 bps (> 15 bps hurdle)
    const signal = engine.evaluateArbitrage(inav, 19.80, 15.0);

    expect(signal.action).toBe('CREATE_AND_SELL_ETF');
    expect(signal.premiumDiscountBps).toBeGreaterThan(100);
    expect(signal.estimatedProfitPerUnitUsd).toBeGreaterThan(0);
  });

  it('generates REDEEM_AND_BUY_ETF signal when market price is at discount to iNAV', () => {
    const calculator = new InavBasketCalculator();
    const inav = calculator.computeInav(mockBasket);

    const engine = new EtfArbitrageEngine();
    // Market price $19.40 vs iNAV $19.60 -> Discount ~ -102 bps (< -15 bps hurdle)
    const signal = engine.evaluateArbitrage(inav, 19.40, 15.0);

    expect(signal.action).toBe('REDEEM_AND_BUY_ETF');
    expect(signal.premiumDiscountBps).toBeLessThan(-100);
    expect(signal.estimatedProfitPerUnitUsd).toBeGreaterThan(0);
  });
});
