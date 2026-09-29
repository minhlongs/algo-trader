/**
 * Venue Balance Verification Logic for Arbitrage Risk Guard
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard-balance
 */

import { logger } from '../../../shared/utils/logger';
import type {
  ArbitrageRiskConfig,
  MultiLegArbitrageBasket,
  ArbitrageRiskContext,
  VenueBalanceSnapshot,
} from './arbitrage-risk-types';
import {
  parseSymbolAssets,
  verifyBuyLegBalance,
  verifySellLegBalance,
} from './arbitrage-risk-guard-balance-helpers';

export * from './arbitrage-risk-guard-balance-helpers';

export function verifyVenueBalances(
  basket: MultiLegArbitrageBasket,
  config: ArbitrageRiskConfig,
  context?: ArbitrageRiskContext,
): { ok: boolean; details?: Record<string, unknown> } {
  const balances = context?.venueBalances;

  // In live mode: balances are mandatory (fail closed)
  if (config.mode === 'live') {
    if (!balances) {
      logger.warn('[ArbitrageRiskGuard] Live mode requires venue balance snapshot', {
        mode: 'live',
      });
      return {
        ok: false,
        details: { error: 'Missing venue balance data in live mode' },
      };
    }
  } else {
    // In paper mode: if no balances provided, assume sufficient for simulation
    if (!balances) {
      return { ok: true };
    }
  }

  // Verify balances per leg
  for (const leg of basket.legs) {
    const { baseAsset, quoteAsset } = parseSymbolAssets(leg.symbol);
    const isBuy = leg.side.toLowerCase() === 'buy';

    // Look up balance record by venue:asset or venue
    const balanceRecord =
      balances[`${leg.venue}:${isBuy ? quoteAsset : baseAsset}`] ??
      balances[`${leg.venue}/${isBuy ? quoteAsset : baseAsset}`] ??
      balances[`${leg.venue}:${isBuy ? baseAsset : quoteAsset}`] ??
      balances[leg.venue];

    if (balanceRecord === undefined) {
      if (config.mode === 'live') {
        return {
          ok: false,
          details: {
            venue: leg.venue,
            error: `No balance found for venue ${leg.venue} in live mode`,
          },
        };
      }
      continue;
    }

    const requiredNotional = leg.notionalUsd ?? leg.amount * leg.price;

    if (typeof balanceRecord === 'number') {
      const available = balanceRecord;
      if (available < requiredNotional) {
        logger.warn('[ArbitrageRiskGuard] Insufficient balance on venue', {
          venue: leg.venue,
          available,
          requiredNotional,
        });
        return {
          ok: false,
          details: {
            venue: leg.venue,
            available,
            requiredNotional,
          },
        };
      }
    } else {
      const snapshot = balanceRecord as VenueBalanceSnapshot;
      const legResult = isBuy
        ? verifyBuyLegBalance(leg, quoteAsset, snapshot, requiredNotional)
        : verifySellLegBalance(leg, baseAsset, quoteAsset, snapshot, requiredNotional);

      if (!legResult.ok) {
        return legResult;
      }
    }
  }

  return { ok: true };
}
