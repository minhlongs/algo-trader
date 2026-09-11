/**
 * Strategy Loader Registry Data
 * Static definitions of Polymarket and DNA strategies with resource metadata.
 */
import type { StrategyRegistryEntry } from './loader-types';
import type { IStrategy } from './types';

export const POLYMARKET_STRATEGIES: StrategyRegistryEntry[] = [
  { name: 'orderbook-depth-ratio', module: '../strategies/polymarket/orderbook-depth-ratio', category: 'arbitrage', priority: 1, memoryFootprintMb: 5, isHeavy: false },
  { name: 'cross-event-drift', module: '../strategies/polymarket/cross-event-drift', category: 'arbitrage', priority: 1, memoryFootprintMb: 8, isHeavy: false },
  { name: 'vol-compression-breakout', module: '../strategies/polymarket/vol-compression-breakout', category: 'momentum', priority: 2, memoryFootprintMb: 6, isHeavy: false },
  { name: 'whale-tracker', module: '../strategies/polymarket/whale-tracker', category: 'flow', priority: 2, memoryFootprintMb: 4, isHeavy: false },
  { name: 'resolution-frontrunner', module: '../strategies/polymarket/resolution-frontrunner', category: 'arbitrage', priority: 1, memoryFootprintMb: 7, isHeavy: false },
  { name: 'multi-leg-hedge', module: '../strategies/polymarket/multi-leg-hedge', category: 'hedging', priority: 3, memoryFootprintMb: 10, isHeavy: false },
  { name: 'regime-adaptive-momentum', module: '../strategies/polymarket/regime-adaptive-momentum', category: 'momentum', priority: 2, memoryFootprintMb: 8, isHeavy: false },
  { name: 'inventory-skew-rebalancer', module: '../strategies/polymarket/inventory-skew-rebalancer', category: 'risk', priority: 3, memoryFootprintMb: 6, isHeavy: false },
  { name: 'bollinger-squeeze', module: '../strategies/polymarket/bollinger-squeeze', category: 'mean-reversion', priority: 3, memoryFootprintMb: 5, isHeavy: false },
  { name: 'relative-strength-rotation', module: '../strategies/polymarket/relative-strength-rotation', category: 'rotational', priority: 2, memoryFootprintMb: 7, isHeavy: false },
  { name: 'time-weighted-mean-reversion', module: '../strategies/polymarket/time-weighted-mean-reversion', category: 'mean-reversion', priority: 3, memoryFootprintMb: 6, isHeavy: false },
  { name: 'stale-quote-sniper', module: '../strategies/polymarket/stale-quote-sniper', category: 'arbitrage', priority: 2, memoryFootprintMb: 4, isHeavy: false },
  { name: 'momentum-cascade', module: '../strategies/polymarket/momentum-cascade', category: 'momentum', priority: 2, memoryFootprintMb: 8, isHeavy: false },
  { name: 'price-impact-estimator', module: '../strategies/polymarket/price-impact-estimator', category: 'flow', priority: 3, memoryFootprintMb: 5, isHeavy: false },
  { name: 'decay-rate-momentum', module: '../strategies/polymarket/decay-rate-momentum', category: 'momentum', priority: 2, memoryFootprintMb: 7, isHeavy: false },
  { name: 'cluster-breakout', module: '../strategies/polymarket/cluster-breakout', category: 'pattern', priority: 3, memoryFootprintMb: 9, isHeavy: false },
  { name: 'gap-fill-reversion', module: '../strategies/polymarket/gap-fill-reversion', category: 'mean-reversion', priority: 3, memoryFootprintMb: 5, isHeavy: false },
  { name: 'recency-bias-exploiter', module: '../strategies/polymarket/recency-bias-exploiter', category: 'behavioral', priority: 4, memoryFootprintMb: 6, isHeavy: false },
  { name: 'weighted-sentiment-aggregator', module: '../strategies/polymarket/weighted-sentiment-aggregator', category: 'sentiment', priority: 4, memoryFootprintMb: 8, isHeavy: true },
  { name: 'order-arrival-rate', module: '../strategies/polymarket/order-arrival-rate', category: 'flow', priority: 3, memoryFootprintMb: 5, isHeavy: false },
  { name: 'regime-switch-detector', module: '../strategies/polymarket/regime-switch-detector', category: 'regime', priority: 2, memoryFootprintMb: 7, isHeavy: false },
  { name: 'event-deadline-scalper', module: '../strategies/polymarket/event-deadline-scalper', category: 'arbitrage', priority: 1, memoryFootprintMb: 4, isHeavy: false },
  { name: 'cross-correlation-lag', module: '../strategies/polymarket/cross-correlation-lag', category: 'statistical', priority: 4, memoryFootprintMb: 10, isHeavy: false },
  { name: 'herd-behavior-detector', module: '../strategies/polymarket/herd-behavior-detector', category: 'behavioral', priority: 4, memoryFootprintMb: 6, isHeavy: false },
  { name: 'info-asymmetry-scanner', module: '../strategies/polymarket/info-asymmetry-scanner', category: 'arbitrage', priority: 2, memoryFootprintMb: 9, isHeavy: false },
  { name: 'mean-variance-optimizer', module: '../strategies/polymarket/mean-variance-optimizer', category: 'portfolio', priority: 3, memoryFootprintMb: 8, isHeavy: false },
  { name: 'pivot-point-bounce', module: '../strategies/polymarket/pivot-point-bounce', category: 'technical', priority: 4, memoryFootprintMb: 4, isHeavy: false },
  { name: 'tail-risk-harvester', module: '../strategies/polymarket/tail-risk-harvester', category: 'risk', priority: 3, memoryFootprintMb: 7, isHeavy: false },
  { name: 'markov-chain-predictor', module: '../strategies/polymarket/markov-chain-predictor', category: 'predictive', priority: 4, memoryFootprintMb: 8, isHeavy: false },
  { name: 'liquidity-migration', module: '../strategies/polymarket/liquidity-migration', category: 'flow', priority: 3, memoryFootprintMb: 5, isHeavy: false },
  { name: 'price-acceleration', module: '../strategies/polymarket/price-acceleration', category: 'momentum', priority: 2, memoryFootprintMb: 6, isHeavy: false },
  { name: 'spread-mean-reversion', module: '../strategies/polymarket/spread-mean-reversion', category: 'arbitrage', priority: 2, memoryFootprintMb: 7, isHeavy: false },
  { name: 'volatility-targeting', module: '../strategies/polymarket/volatility-targeting', category: 'risk', priority: 3, memoryFootprintMb: 6, isHeavy: false },
];

export const DNA_STRATEGIES: StrategyRegistryEntry[] = [
  { name: 'kronos-strategy', module: '../strategies/kronos-strategy', category: 'temporal', priority: 3, memoryFootprintMb: 12, isHeavy: false },
  { name: 'consensus-engine', module: '../strategies/dna/consensus-engine', category: 'signals', priority: 2, memoryFootprintMb: 10, isHeavy: false },
  { name: 'dna-state-store', module: '../strategies/dna/dna-state-store', category: 'state', priority: 4, memoryFootprintMb: 5, isHeavy: false },
  { name: 'orchestrator', module: '../strategies/dna/orchestrator', category: 'meta', priority: 1, memoryFootprintMb: 15, isHeavy: false },
  { name: 'paper-executor', module: '../strategies/dna/paper-executor', category: 'execution', priority: 2, memoryFootprintMb: 8, isHeavy: false },
];

export function getInitialStrategies(): StrategyRegistryEntry[] {
  return [...POLYMARKET_STRATEGIES, ...DNA_STRATEGIES];
}

export async function batchPreloadStrategies(
  strategyIds: string[],
  loadFn: (id: string) => Promise<IStrategy | null>,
): Promise<Map<string, IStrategy | null>> {
  const results = new Map<string, IStrategy | null>();
  const BATCH_SIZE = 5;

  for (let i = 0; i < strategyIds.length; i += BATCH_SIZE) {
    const batch = strategyIds.slice(i, i + BATCH_SIZE);
    const resultsBatch = await Promise.allSettled(batch.map((id) => loadFn(id)));

    batch.forEach((id, idx) => {
      const res = resultsBatch[idx];
      results.set(id, res.status === 'fulfilled' ? res.value : null);
    });

    if (i + BATCH_SIZE < strategyIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  return results;
}
