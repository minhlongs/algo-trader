/**
 * Supervised Engine Normalizers
 *
 * Per-engine dispatch of a raw engine signal into normalized trade intents.
 * Extracted from SupervisedEngine.enqueueRaw so the supervised engine keeps
 * only lifecycle/queue concerns and the dispatch table stays in one place.
 */

import type { SignalNormalizer } from '../orchestrator/signal-normalizer';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import type { EngineId } from '../portfolio/types';

/** Default quote venue/symbol conventions per engine. */
const AMM_QUOTE_SYMBOL = 'BTC/USDT';

/** Normalize a raw engine signal for the given engine id. */
export function normalizeEngineSignal(
  engineId: EngineId,
  rawSignal: unknown,
  normalizer: SignalNormalizer,
  type = 'default',
): UnifiedTradeIntent[] {
  if (engineId === 'arbitrage') {
    return normalizer.normalizeArbitrage(rawSignal as Parameters<SignalNormalizer['normalizeArbitrage']>[0]);
  }

  if (engineId === 'marl') {
    return type === 'order'
      ? [normalizer.normalizeMarlOrder(rawSignal as Parameters<SignalNormalizer['normalizeMarlOrder']>[0])]
      : normalizer.normalizeMarlQuote(rawSignal as Parameters<SignalNormalizer['normalizeMarlQuote']>[0]);
  }

  if (engineId === 'amm') {
    if (type === 'rebalance') {
      return [normalizer.normalizeAmmRebalance(rawSignal as Parameters<SignalNormalizer['normalizeAmmRebalance']>[0])];
    }
    if (type === 'arbitrage') {
      return normalizer.normalizeAmmArbitrage(rawSignal as Parameters<SignalNormalizer['normalizeAmmArbitrage']>[0]);
    }
    return normalizer.normalizeAmmQuote(
      rawSignal as Parameters<SignalNormalizer['normalizeAmmQuote']>[0],
      AMM_QUOTE_SYMBOL,
    );
  }

  if (engineId === 'alpha-lab') {
    return type === 'trade'
      ? [normalizer.normalizeTradeSignal(rawSignal as Parameters<SignalNormalizer['normalizeTradeSignal']>[0])]
      : [normalizer.normalizeAlphaSignal(rawSignal as Parameters<SignalNormalizer['normalizeAlphaSignal']>[0])];
  }

  return [];
}
