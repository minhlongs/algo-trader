/**
 * Helper routines for batch result resolution and individual fallback execution
 */

import { PendingTrade, TradeResult, SingleExecutor } from './gas-batch-optimizer-types';

export function resolveBatchOutcomes(
  results: TradeResult[],
  resolvers: Map<string, (result: TradeResult) => void>
): void {
  for (const result of results) {
    const resolver = resolvers.get(result.tradeId);
    resolver?.(result);
    resolvers.delete(result.tradeId);
  }
}

export function rejectMissingTrades(
  batch: PendingTrade[],
  resolvers: Map<string, (result: TradeResult) => void>
): void {
  for (const trade of batch) {
    if (resolvers.has(trade.id)) {
      const resolver = resolvers.get(trade.id);
      const errorResult: TradeResult = {
        tradeId: trade.id,
        success: false,
        error: 'Batch executor failed to return result for this trade',
        executedViaBatch: true,
      };
      resolver?.(errorResult);
      resolvers.delete(trade.id);
    }
  }
}

export async function executeFallbackTrades(
  trades: PendingTrade[],
  singleExecutor: SingleExecutor,
  resolvers: Map<string, (result: TradeResult) => void>
): Promise<void> {
  const results = await Promise.allSettled(
    trades.map((trade) => singleExecutor(trade))
  );

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i]!;
    const outcome = results[i]!;
    const resolver = resolvers.get(trade.id);

    if (outcome.status === 'fulfilled') {
      resolver?.(outcome.value);
    } else {
      const errorResult: TradeResult = {
        tradeId: trade.id,
        success: false,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        executedViaBatch: false,
      };
      resolver?.(errorResult);
    }

    resolvers.delete(trade.id);
  }
}
