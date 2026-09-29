/**
 * Venue Latency and Operating Mode Credential Gates for Arbitrage Risk Guard
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard-latency-credentials
 */

import { logger } from '../../../shared/utils/logger';
import {
  type ArbitrageRiskConfig,
  type MultiLegArbitrageBasket,
  type ArbitrageRiskContext,
  type ArbitrageRiskGateChecks,
  type ArbitrageRiskCheckResult,
  ArbitrageRejectionReason,
} from './arbitrage-risk-types';
import type { CircuitBreaker } from '../../risk/circuit-breaker';
import type { SpreadDetector } from '../spread-detector';

export interface LatencyGateDependencies {
  config: ArbitrageRiskConfig;
  circuitBreaker?: CircuitBreaker;
  spreadDetector?: SpreadDetector;
}

export async function evaluateVenueLatency(
  basket: MultiLegArbitrageBasket,
  context: ArbitrageRiskContext | undefined,
  checks: ArbitrageRiskGateChecks,
  deps: LatencyGateDependencies,
): Promise<ArbitrageRiskCheckResult | null> {
  const { config, circuitBreaker, spreadDetector } = deps;
  const venueLatencies = context?.venueLatencies ?? {};

  for (const leg of basket.legs) {
    let lat = venueLatencies[leg.venue];

    if (lat === undefined && spreadDetector) {
      const detector = spreadDetector as unknown as {
        getExchangeLatency?: (v: string) => { avgLatency: number; p95Latency: number };
      };
      if (typeof detector.getExchangeLatency === 'function') {
        const spreadLat = detector.getExchangeLatency(leg.venue);
        lat = Math.max(spreadLat.p95Latency, spreadLat.avgLatency);
      }
    }

    if (lat !== undefined) {
      if (lat > config.maxVenueLatencyMs) {
        checks.venueLatencyOk = false;
        logger.warn('[ArbitrageRiskGuard] Venue latency spike exceeded threshold', {
          venue: leg.venue,
          latencyMs: lat,
          maxLatencyMs: config.maxVenueLatencyMs,
        });
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.VENUE_LATENCY_SPIKE,
          adjustedNotionalUsd: 0,
          checks,
          details: {
            venue: leg.venue,
            latencyMs: lat,
            thresholdMs: config.maxVenueLatencyMs,
          },
        };
      }

      if (circuitBreaker) {
        const cbAllowed = await circuitBreaker.checkLatency(lat);
        if (!cbAllowed) {
          checks.venueLatencyOk = false;
          return {
            allowed: false,
            rejectionReason: ArbitrageRejectionReason.VENUE_LATENCY_SPIKE,
            adjustedNotionalUsd: 0,
            checks,
            details: {
              venue: leg.venue,
              latencyMs: lat,
              circuitBreakerTripped: true,
            },
          };
        }
      }
    }
  }

  return null;
}

export function verifyLiveCredentials(
  basket: MultiLegArbitrageBasket,
  context?: ArbitrageRiskContext,
): boolean {
  if (process.env.LIVE_TRADING_ENABLED !== 'true') {
    return false;
  }

  for (const leg of basket.legs) {
    const venue = leg.venue.toLowerCase();

    if (context?.credentials?.[leg.venue] === true) {
      continue;
    }
    if (
      typeof context?.credentials?.[leg.venue] === 'object' &&
      context.credentials[leg.venue] !== null
    ) {
      continue;
    }

    if (venue.includes('poly')) {
      const hasPoly =
        Boolean(process.env.POLYMARKET_API_KEY) &&
        Boolean(process.env.POLYMARKET_PRIVATE_KEY);
      if (!hasPoly) return false;
    } else if (venue.includes('binance')) {
      const hasBinance =
        Boolean(process.env.BINANCE_API_KEY) &&
        Boolean(process.env.BINANCE_API_SECRET);
      if (!hasBinance) return false;
    } else if (venue.includes('bybit')) {
      const hasBybit =
        Boolean(process.env.BYBIT_API_KEY) &&
        Boolean(process.env.BYBIT_API_SECRET);
      if (!hasBybit) return false;
    } else if (venue.includes('kucoin')) {
      const hasKucoin =
        Boolean(process.env.KUCOIN_API_KEY) &&
        Boolean(process.env.KUCOIN_API_SECRET) &&
        Boolean(process.env.KUCOIN_PASSPHRASE || process.env.KUCOIN_PASSWORD);
      if (!hasKucoin) return false;
    } else {
      const envKey = `${venue.toUpperCase()}_API_KEY`;
      const envSecret = `${venue.toUpperCase()}_API_SECRET`;
      if (!process.env[envKey] || !process.env[envSecret]) {
        return false;
      }
    }
  }

  return true;
}
