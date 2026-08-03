import { describe, it, expect } from 'vitest';
import { WhaleCopyTrader, startWhaleCopyTrader } from '../whale-copy-trader';

describe('whale-copy-trader::WhaleCopyTrader', () => {
  it('instantiates with defaults', () => {
    const trader = new WhaleCopyTrader();
    expect(trader).toBeDefined();
  });

  it('instantiates with custom options', () => {
    const trader = new WhaleCopyTrader({ copyRatio: 0.05, portfolioUsdc: 5000 });
    expect(trader).toBeDefined();
  });

  it('startWhaleCopyTrader returns instance', () => {
    const trader = startWhaleCopyTrader({ portfolioUsdc: 500 });
    expect(trader).toBeDefined();
    expect(trader).toBeInstanceOf(WhaleCopyTrader);
  });

  it('recordOutcome updates wins/losses', () => {
    const trader = new WhaleCopyTrader();
    trader.recordOutcome('0xabc', true);
    trader.recordOutcome('0xabc', true);
    trader.recordOutcome('0xabc', false);
    const stats = trader.getStats().get('0xabc');
    expect(stats).toBeDefined();
    expect(stats.totalTrades).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
  });

  it('accuracy uses neutral 0.5 when below MIN_TRADES threshold', () => {
    const trader = new WhaleCopyTrader();
    trader.recordOutcome('0xabc', true);
    trader.recordOutcome('0xabc', true);
    trader.recordOutcome('0xabc', false);
    const stats = trader.getStats().get('0xabc');
    // MIN_TRADES_FOR_ACCURACY = 5, so 3 trades gives neutral 0.5
    expect(stats.accuracy).toBeCloseTo(0.5, 5);
  });

  it('getStats returns empty map for fresh instance', () => {
    const trader = new WhaleCopyTrader();
    expect(trader.getStats().size).toBe(0);
  });

  it('multiple wallets tracked independently', () => {
    const trader = new WhaleCopyTrader();
    trader.recordOutcome('0xaaa', true);
    trader.recordOutcome('0xbbb', false);
    expect(trader.getStats().size).toBe(2);
    expect(trader.getStats().get('0xaaa').wins).toBe(1);
    expect(trader.getStats().get('0xbbb').losses).toBe(1);
  });
});
