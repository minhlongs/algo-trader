/**
 * Open Exposure Management Logic for Arbitrage Risk Guard
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard-exposure
 */

import { logger } from '../../../shared/utils/logger';
import {
  type ArbitrageRiskConfig,
  type MultiLegArbitrageBasket,
  type ArbitrageRiskGateChecks,
  type ArbitrageRiskCheckResult,
  ArbitrageRejectionReason,
} from './arbitrage-risk-types';

export class ExposureTracker {
  readonly venueExposures = new Map<string, number>();
  readonly symbolExposures = new Map<string, number>();

  checkExposureGates(
    basket: MultiLegArbitrageBasket,
    config: ArbitrageRiskConfig,
    checks: ArbitrageRiskGateChecks,
  ): ArbitrageRiskCheckResult | null {
    // Check venue exposure per leg
    for (const leg of basket.legs) {
      const legNotional = leg.notionalUsd ?? leg.amount * leg.price;
      const currentVenueExp = this.venueExposures.get(leg.venue) ?? 0;
      if (currentVenueExp + legNotional > config.maxOpenPositionPerVenueUsd) {
        checks.venueCapOk = false;
        logger.warn('[ArbitrageRiskGuard] Exceeds max open position per venue', {
          venue: leg.venue,
          currentVenueExp,
          legNotional,
          limit: config.maxOpenPositionPerVenueUsd,
        });
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.EXCEEDS_VENUE_CAP,
          adjustedNotionalUsd: 0,
          checks,
          details: {
            limitType: 'venue',
            venue: leg.venue,
            currentExposure: currentVenueExp,
            addedNotional: legNotional,
            limit: config.maxOpenPositionPerVenueUsd,
          },
        };
      }
    }

    // Group legs by symbol to avoid intra-basket double counting
    const symbolLegMap = new Map<string, number>();
    for (const leg of basket.legs) {
      const legNotional = leg.notionalUsd ?? leg.amount * leg.price;
      const current = symbolLegMap.get(leg.symbol) ?? 0;
      symbolLegMap.set(leg.symbol, Math.max(current, legNotional));
    }

    // Check symbol exposure per symbol
    for (const [symbol, notional] of Array.from(symbolLegMap.entries())) {
      const currentSymbolExp = this.symbolExposures.get(symbol) ?? 0;
      if (currentSymbolExp + notional > config.maxOpenPositionPerSymbolUsd) {
        checks.symbolCapOk = false;
        logger.warn('[ArbitrageRiskGuard] Exceeds max open position per symbol', {
          symbol,
          currentSymbolExp,
          notional,
          limit: config.maxOpenPositionPerSymbolUsd,
        });
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.EXCEEDS_SYMBOL_CAP,
          adjustedNotionalUsd: 0,
          checks,
          details: {
            limitType: 'symbol',
            symbol,
            currentExposure: currentSymbolExp,
            addedNotional: notional,
            limit: config.maxOpenPositionPerSymbolUsd,
          },
        };
      }
    }

    return null;
  }

  recordTradeOpened(
    basketOrSymbol: MultiLegArbitrageBasket | string,
    buyVenue?: string,
    sellVenue?: string,
    notional?: number,
  ): void {
    if (typeof basketOrSymbol === 'object' && 'legs' in basketOrSymbol) {
      const symbolNotionals = new Map<string, number>();
      for (const leg of basketOrSymbol.legs) {
        const legNotional = leg.notionalUsd ?? leg.amount * leg.price;
        if (!Number.isFinite(legNotional) || legNotional <= 0) continue;
        this.venueExposures.set(leg.venue, (this.venueExposures.get(leg.venue) ?? 0) + legNotional);
        const curr = symbolNotionals.get(leg.symbol) ?? 0;
        symbolNotionals.set(leg.symbol, Math.max(curr, legNotional));
      }
      for (const [symbol, val] of Array.from(symbolNotionals.entries())) {
        this.symbolExposures.set(symbol, (this.symbolExposures.get(symbol) ?? 0) + val);
      }
    } else if (typeof basketOrSymbol === 'string' && buyVenue && sellVenue && typeof notional === 'number') {
      if (!Number.isFinite(notional) || notional <= 0) return;
      this.symbolExposures.set(basketOrSymbol, (this.symbolExposures.get(basketOrSymbol) ?? 0) + notional);
      this.venueExposures.set(buyVenue, (this.venueExposures.get(buyVenue) ?? 0) + notional);
      this.venueExposures.set(sellVenue, (this.venueExposures.get(sellVenue) ?? 0) + notional);
    }
  }

  recordTradeClosed(
    basketOrSymbol: MultiLegArbitrageBasket | string,
    buyVenue?: string,
    sellVenue?: string,
    notional?: number,
  ): void {
    if (typeof basketOrSymbol === 'object' && 'legs' in basketOrSymbol) {
      const symbolNotionals = new Map<string, number>();
      for (const leg of basketOrSymbol.legs) {
        const legNotional = leg.notionalUsd ?? leg.amount * leg.price;
        if (!Number.isFinite(legNotional) || legNotional <= 0) continue;
        const venueExp = Math.max(0, (this.venueExposures.get(leg.venue) ?? 0) - legNotional);
        this.venueExposures.set(leg.venue, venueExp);
        const curr = symbolNotionals.get(leg.symbol) ?? 0;
        symbolNotionals.set(leg.symbol, Math.max(curr, legNotional));
      }
      for (const [symbol, val] of Array.from(symbolNotionals.entries())) {
        const symbolExp = Math.max(0, (this.symbolExposures.get(symbol) ?? 0) - val);
        this.symbolExposures.set(symbol, symbolExp);
      }
    } else if (typeof basketOrSymbol === 'string' && buyVenue && sellVenue && typeof notional === 'number') {
      if (!Number.isFinite(notional) || notional <= 0) return;
      const symExp = Math.max(0, (this.symbolExposures.get(basketOrSymbol) ?? 0) - notional);
      const buyExp = Math.max(0, (this.venueExposures.get(buyVenue) ?? 0) - notional);
      const sellExp = Math.max(0, (this.venueExposures.get(sellVenue) ?? 0) - notional);
      this.symbolExposures.set(basketOrSymbol, symExp);
      this.venueExposures.set(buyVenue, buyExp);
      this.venueExposures.set(sellVenue, sellExp);
    }
  }

  getExposures(): { venues: Record<string, number>; symbols: Record<string, number> } {
    return {
      venues: Object.fromEntries(this.venueExposures.entries()),
      symbols: Object.fromEntries(this.symbolExposures.entries()),
    };
  }

  resetExposures(): void {
    this.venueExposures.clear();
    this.symbolExposures.clear();
  }
}
