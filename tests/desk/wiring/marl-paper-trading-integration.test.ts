import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordMarlPaperFill,
  getPortfolio,
  __resetPortfolioForTests,
  deriveSource,
} from '../../../src/desk/wiring/paper-trading-orchestrator';

describe('MARL Paper Trading Integration', () => {
  beforeEach(() => {
    __resetPortfolioForTests?.();
  });

  it('records MARL maker buy fill into paper portfolio', () => {
    const initialPortfolio = getPortfolio();
    const initialCapital = initialPortfolio.capital;

    const trade = recordMarlPaperFill('poly-btc-2026', 'buy', 10, 0.52);

    expect(trade).toBeDefined();
    expect(trade.marketId).toBe('poly-btc-2026');
    expect(trade.side).toBe('YES');
    expect(trade.size).toBe(5.2);
    expect(trade.entryPrice).toBe(0.52);
    expect(trade.strategy).toBe('marl-avellaneda-stoikov');
    expect(trade.source).toBe('legacy');

    const updatedPortfolio = getPortfolio();
    expect(updatedPortfolio.positions.length).toBeGreaterThan(0);
    expect(updatedPortfolio.capital).toBeCloseTo(initialCapital - 5.2, 4);
  });

  it('records MARL maker sell fill with correct NO side', () => {
    const trade = recordMarlPaperFill('poly-eth-2026', 'sell', 20, 0.45, 'marl-inventory-skew');

    expect(trade.side).toBe('NO');
    expect(trade.size).toBe(9.0);
    expect(trade.entryPrice).toBe(0.45);
    expect(trade.strategy).toBe('marl-inventory-skew');
  });

  it('ensures deriveSource satisfies canonical 4-source contract', () => {
    expect(deriveSource('qwen-momentum')).toBe('qwen');
    expect(deriveSource('deepseek-alpha')).toBe('deepseek');
    expect(deriveSource('swarm-consensus')).toBe('swarm');
    expect(deriveSource('marl-avellaneda-stoikov')).toBe('legacy');
    expect(deriveSource('unknown-strategy')).toBe('legacy');
  });
});
