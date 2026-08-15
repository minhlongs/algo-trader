/**
 * Position validation logic
 * Extracted from position-manager.ts for modularity
 */

import type { PositionConfig, PositionValidation, ExposureSummary } from './position-manager-types';

/** Validate a proposed position against all exposure limits (pure function) */
export function validateExposureLimits(
  config: PositionConfig,
  summary: ExposureSummary,
  symbol: string,
  exchange: string,
  side: 'long' | 'short',
  amount: number,
): PositionValidation {
  const positionValue = amount;

  const currentSymbolExposure = summary.perSymbol.get(symbol) || 0;
  if (currentSymbolExposure + positionValue > config.maxPositionPerSymbol) {
    return { valid: false, reason: `Symbol limit exceeded: ${symbol}`, currentExposure: currentSymbolExposure, newExposure: currentSymbolExposure + positionValue };
  }

  const currentExchangeExposure = summary.perExchange.get(exchange) || 0;
  if (currentExchangeExposure + positionValue > config.maxPositionPerExchange) {
    return { valid: false, reason: `Exchange limit exceeded: ${exchange}`, currentExposure: currentExchangeExposure, newExposure: currentExchangeExposure + positionValue };
  }

  if (summary.netExposure + positionValue > config.maxTotalExposure) {
    return { valid: false, reason: 'Total exposure limit exceeded', currentExposure: summary.netExposure, newExposure: summary.netExposure + positionValue };
  }

  if (side === 'long' && summary.totalLong + positionValue > config.maxLongExposure) {
    return { valid: false, reason: 'Long exposure limit exceeded', currentExposure: summary.totalLong, newExposure: summary.totalLong + positionValue };
  }

  if (side === 'short' && summary.totalShort + positionValue > config.maxShortExposure) {
    return { valid: false, reason: 'Short exposure limit exceeded', currentExposure: summary.totalShort, newExposure: summary.totalShort + positionValue };
  }

  return { valid: true, currentExposure: summary.netExposure, newExposure: summary.netExposure + positionValue };
}

/** Build exposure summary from Redis position hashes */
export async function buildExposureSummary(redis: { keys: (pattern: string) => Promise<string[]>; hgetall: (key: string) => Promise<Record<string, string> | null> }): Promise<ExposureSummary> {
  const summary: ExposureSummary = { totalLong: 0, totalShort: 0, netExposure: 0, perSymbol: new Map(), perExchange: new Map() };
  const keys = await redis.keys('position:*');
  for (const key of keys) {
    const data = await redis.hgetall(key);
    if (!data || !data.amount) continue;
    const amount = parseFloat(data.amount);
    if (data.side === 'long') summary.totalLong += amount; else summary.totalShort += amount;
    summary.perSymbol.set(data.symbol, (summary.perSymbol.get(data.symbol) || 0) + amount);
    summary.perExchange.set(data.exchange, (summary.perExchange.get(data.exchange) || 0) + amount);
  }
  summary.netExposure = summary.totalLong - summary.totalShort;
  return summary;
}
