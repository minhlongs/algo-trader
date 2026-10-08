import { CurrencyRate, TriangularCycle } from './fx-types';

export class BellmanFordTriangularArb {
  /**
   * Builds currency graph using -ln(rate) transformation and identifies profitable cycles.
   * Selling base for quote gives 'bid' rate: from Base to Quote with rate = bid.
   * Buying base using quote gives 1/'ask' rate: from Quote to Base with rate = 1/ask.
   */
  public findTriangularArbitrage(
    rates: CurrencyRate[],
    maxCycleLength = 4,
    minProfitBps = 0.5
  ): TriangularCycle[] {
    const currencies = new Set<string>();
    const edges: { from: string; to: string; rate: number; action: 'BUY' | 'SELL' }[] = [];

    for (const r of rates) {
      currencies.add(r.baseCurrency);
      currencies.add(r.quoteCurrency);

      // Base -> Quote: sell Base at bid price
      edges.push({
        from: r.baseCurrency,
        to: r.quoteCurrency,
        rate: r.bid,
        action: 'SELL',
      });

      // Quote -> Base: buy Base at ask price -> 1 / ask
      edges.push({
        from: r.quoteCurrency,
        to: r.baseCurrency,
        rate: 1.0 / r.ask,
        action: 'BUY',
      });
    }

    const currList = Array.from(currencies);
    const profitableCycles: TriangularCycle[] = [];

    // Search 3-node and 4-node paths for negative weight cycles (i.e. product of rates > 1.0)
    for (const startCurr of currList) {
      this.searchCycles(startCurr, startCurr, 1.0, [startCurr], [], edges, maxCycleLength, minProfitBps, profitableCycles);
    }

    // Sort by profit descending
    return profitableCycles.sort((a, b) => b.profitBps - a.profitBps);
  }

  private searchCycles(
    current: string,
    target: string,
    cumProduct: number,
    path: string[],
    legs: { from: string; to: string; rate: number; action: 'BUY' | 'SELL' }[],
    edges: { from: string; to: string; rate: number; action: 'BUY' | 'SELL' }[],
    maxLen: number,
    minProfitBps: number,
    results: TriangularCycle[]
  ): void {
    if (path.length > maxLen + 1) return;

    if (path.length > 2 && current === target) {
      const profitBps = (cumProduct - 1.0) * 10000;
      if (profitBps >= minProfitBps) {
        // Prevent duplicate reversed cycles
        const key = path.join('->');
        if (!results.some((r) => r.path.join('->') === key)) {
          results.push({
            path: [...path],
            multiplier: Number(cumProduct.toFixed(6)),
            profitBps: Number(profitBps.toFixed(2)),
            ratesTraversed: legs.map((l) => Number(l.rate.toFixed(5))),
            executionLegs: [...legs],
          });
        }
      }
      return;
    }

    const outgoing = edges.filter((e) => e.from === current);
    for (const edge of outgoing) {
      if (edge.to === target && path.length >= 3) {
        this.searchCycles(edge.to, target, cumProduct * edge.rate, [...path, edge.to], [...legs, edge], edges, maxLen, minProfitBps, results);
      } else if (!path.includes(edge.to) && path.length < maxLen) {
        this.searchCycles(edge.to, target, cumProduct * edge.rate, [...path, edge.to], [...legs, edge], edges, maxLen, minProfitBps, results);
      }
    }
  }
}
