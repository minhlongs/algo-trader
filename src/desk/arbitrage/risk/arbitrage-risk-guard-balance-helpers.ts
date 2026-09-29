/**
 * Venue Balance Asset Parsing and Leg Verification Helpers
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard-balance-helpers
 */

import { logger } from '../../../shared/utils/logger';
import type {
  ArbitrageBasketLeg,
  VenueBalanceSnapshot,
} from './arbitrage-risk-types';

export function parseSymbolAssets(symbol: string): { baseAsset: string; quoteAsset: string } {
  const upper = symbol.toUpperCase();
  const sep = ['/', '-', '_'].find((s) => upper.includes(s));
  if (sep) {
    const [base, quote] = upper.split(sep);
    return { baseAsset: base, quoteAsset: quote };
  }
  return { baseAsset: upper, quoteAsset: 'USD' };
}

export function isQuoteEquivalent(asset: string, quoteAsset: string): boolean {
  const a = asset.toUpperCase();
  const q = quoteAsset.toUpperCase();
  if (a === q) return true;
  const USD_EQUIVALENTS = new Set(['USD', 'USDC', 'USDT', 'DAI', 'BUSD', 'FDUSD']);
  if (USD_EQUIVALENTS.has(a) && USD_EQUIVALENTS.has(q)) return true;
  return false;
}

export function verifyBuyLegBalance(
  leg: ArbitrageBasketLeg,
  quoteAsset: string,
  snapshot: VenueBalanceSnapshot,
  requiredNotional: number,
): { ok: boolean; details?: Record<string, unknown> } {
  if (!isQuoteEquivalent(snapshot.asset, quoteAsset)) {
    logger.warn('[ArbitrageRiskGuard] Asset mismatch on venue for buy leg', {
      venue: leg.venue,
      asset: snapshot.asset,
      expectedAsset: quoteAsset,
    });
    return {
      ok: false,
      details: {
        venue: leg.venue,
        available: snapshot.free,
        requiredNotional,
        asset: snapshot.asset,
        expectedAsset: quoteAsset,
        error: `Asset mismatch: buy leg requires quote asset ${quoteAsset}, but venue provided ${snapshot.asset}`,
      },
    };
  }

  const available = snapshot.free;
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

  return { ok: true };
}

export function verifySellLegBalance(
  leg: ArbitrageBasketLeg,
  baseAsset: string,
  quoteAsset: string,
  snapshot: VenueBalanceSnapshot,
  requiredNotional: number,
): { ok: boolean; details?: Record<string, unknown> } {
  const snapshotAssetUpper = snapshot.asset.toUpperCase();
  const baseUpper = baseAsset.toUpperCase();

  if (snapshotAssetUpper === baseUpper) {
    const available = snapshot.free;
    const requiredAmount = leg.amount;
    if (available < requiredAmount) {
      logger.warn('[ArbitrageRiskGuard] Insufficient base asset balance on venue', {
        venue: leg.venue,
        available,
        requiredAmount,
        requiredNotional,
      });
      return {
        ok: false,
        details: {
          venue: leg.venue,
          available,
          requiredAmount,
          requiredNotional,
          asset: snapshot.asset,
          expectedAsset: baseAsset,
        },
      };
    }
  } else if (isQuoteEquivalent(snapshot.asset, quoteAsset)) {
    const available = snapshot.free;
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
    logger.warn('[ArbitrageRiskGuard] Asset mismatch on venue for sell leg', {
      venue: leg.venue,
      asset: snapshot.asset,
      expectedAsset: baseAsset,
    });
    return {
      ok: false,
      details: {
        venue: leg.venue,
        available: snapshot.free,
        requiredNotional,
        asset: snapshot.asset,
        expectedAsset: baseAsset,
        error: `Asset mismatch: sell leg requires base asset ${baseAsset} or quote asset ${quoteAsset}, but venue provided ${snapshot.asset}`,
      },
    };
  }

  return { ok: true };
}
