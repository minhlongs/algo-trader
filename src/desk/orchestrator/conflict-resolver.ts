/**
 * Cross-Engine Conflict Resolver
 * Detects opposing directional buy/sell intents across engines on identical instruments.
 */

import { logger } from '../../shared/utils/logger';
import type { UnifiedTradeIntent } from './orchestrator-types';

export interface ConflictPair {
  readonly buyIntent: UnifiedTradeIntent;
  readonly sellIntent: UnifiedTradeIntent;
  readonly symbol: string;
  readonly isSameVenue: boolean;
}

export interface InstrumentConflictGroup {
  readonly symbol: string;
  readonly buyIntents: UnifiedTradeIntent[];
  readonly sellIntents: UnifiedTradeIntent[];
  readonly hasConflict: boolean;
}

export class ConflictResolver {
  public normalizeSymbol(symbol: string): string {
    return symbol
      .trim()
      .toUpperCase()
      .replace(/[-_]/g, '/');
  }

  public hasOpposition(a: UnifiedTradeIntent, b: UnifiedTradeIntent): boolean {
    if (a.intentId === b.intentId) return false;
    return this.normalizeSymbol(a.symbol) === this.normalizeSymbol(b.symbol) && a.side !== b.side;
  }

  public groupIntentsBySymbol(
    intents: readonly UnifiedTradeIntent[]
  ): Map<string, InstrumentConflictGroup> {
    const groups = new Map<string, { buy: UnifiedTradeIntent[]; sell: UnifiedTradeIntent[] }>();

    for (const intent of intents) {
      const sym = this.normalizeSymbol(intent.symbol);
      const entry = groups.get(sym) ?? { buy: [], sell: [] };
      if (intent.side === 'BUY') {
        entry.buy.push(intent);
      } else {
        entry.sell.push(intent);
      }
      groups.set(sym, entry);
    }

    const result = new Map<string, InstrumentConflictGroup>();
    for (const [symbol, { buy, sell }] of groups.entries()) {
      result.set(symbol, {
        symbol,
        buyIntents: buy,
        sellIntents: sell,
        hasConflict: buy.length > 0 && sell.length > 0,
      });
    }
    return result;
  }

  public findOpposingPairs(intents: readonly UnifiedTradeIntent[]): ConflictPair[] {
    const groups = this.groupIntentsBySymbol(intents);
    const pairs: ConflictPair[] = [];

    for (const [symbol, group] of groups.entries()) {
      if (!group.hasConflict) continue;

      const buys = [...group.buyIntents];
      const sells = [...group.sellIntents];

      for (let b = 0; b < buys.length && sells.length > 0; b++) {
        const buy = buys[b];
        const sell = sells.shift()!;
        pairs.push({
          buyIntent: buy,
          sellIntent: sell,
          symbol,
          isSameVenue: buy.venue === sell.venue,
        });
      }
    }

    if (pairs.length > 0) {
      logger.info('Detected opposing directional intent conflicts', {
        conflictCount: pairs.length,
        symbols: pairs.map((p) => p.symbol),
      });
    }

    return pairs;
  }

  public extractNonConflictingIntents(
    intents: readonly UnifiedTradeIntent[]
  ): UnifiedTradeIntent[] {
    const groups = this.groupIntentsBySymbol(intents);
    const nonConflicting: UnifiedTradeIntent[] = [];

    for (const group of groups.values()) {
      if (!group.hasConflict) {
        nonConflicting.push(...group.buyIntents, ...group.sellIntents);
      }
    }
    return nonConflicting;
  }
}
