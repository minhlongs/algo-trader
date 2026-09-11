/**
 * Cross-Platform Arbitrage — Types & Config
 *
 * Extracted from cross-platform-arb.ts to keep files under 200 lines.
 * Re-exported via cross-platform-arb.ts facade.
 */

export interface PlatformPrice {
  platform: 'polymarket' | 'kalshi' | 'binance' | 'okx' | 'bybit';
  asset: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
}

export interface ArbOpportunity {
  asset: string;
  buyPlatform: string;
  sellPlatform: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  estimatedProfit: number;
  confidence: 'high' | 'medium' | 'low';
  timestamp: number;
}

export interface ArbConfig {
  minSpreadPercent: number;
  maxAssets: number;
  pollIntervalMs: number;
}
