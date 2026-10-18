/**
 * Pure Validation Rules for OrderValidator
 * Evaluates spread bounds, position size limits, exchange allowlists,
 * blocked symbols, daily trade caps, and latency/staleness warnings.
 */

import type { ArbitrageOpportunity } from '../arbitrage/spread-detector';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidatorConfig {
  minSpreadPercent: number;
  maxSpreadPercent: number;
  maxPositionSize: number;
  minPositionSize: number;
  maxDailyTrades: number;
  allowedExchanges: string[];
  blockedSymbols: string[];
}

export const DEFAULT_VALIDATOR_CONFIG: ValidatorConfig = {
  minSpreadPercent: 0.1,
  maxSpreadPercent: 5.0,
  maxPositionSize: 1.0, // BTC
  minPositionSize: 0.001,
  maxDailyTrades: 1000,
  allowedExchanges: ['binance', 'okx', 'bybit'],
  blockedSymbols: [],
};

export function evaluateOpportunityRules(
  opportunity: ArbitrageOpportunity,
  amount: number,
  config: ValidatorConfig,
  dailyTradeCount: number,
  now = Date.now(),
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check spread range
  if (opportunity.spreadPercent < config.minSpreadPercent) {
    errors.push(
      `Spread ${opportunity.spreadPercent.toFixed(2)}% below minimum ${config.minSpreadPercent}%`
    );
  }

  if (opportunity.spreadPercent > config.maxSpreadPercent) {
    warnings.push(
      `Spread ${opportunity.spreadPercent.toFixed(2)}% unusually high - possible stale data`
    );
  }

  // Check position size
  if (amount < config.minPositionSize) {
    errors.push(`Amount ${amount} below minimum ${config.minPositionSize}`);
  }

  if (amount > config.maxPositionSize) {
    errors.push(`Amount ${amount} exceeds maximum ${config.maxPositionSize}`);
  }

  // Check daily trade limit
  if (dailyTradeCount >= config.maxDailyTrades) {
    errors.push(`Daily trade limit reached: ${dailyTradeCount}/${config.maxDailyTrades}`);
  }

  // Check allowed exchanges
  if (!config.allowedExchanges.includes(opportunity.buyExchange.toLowerCase())) {
    errors.push(`Buy exchange ${opportunity.buyExchange} not in allowed list`);
  }

  if (!config.allowedExchanges.includes(opportunity.sellExchange.toLowerCase())) {
    errors.push(`Sell exchange ${opportunity.sellExchange} not in allowed list`);
  }

  // Check blocked symbols
  const symbol = opportunity.symbol.toUpperCase();
  if (config.blockedSymbols.includes(symbol)) {
    errors.push(`Symbol ${symbol} is blocked from trading`);
  }

  // Check latency
  if (opportunity.latency > 500) {
    warnings.push(`High latency: ${opportunity.latency}ms`);
  }

  // Check opportunity age
  const age = now - opportunity.timestamp;
  if (age > 1000) {
    warnings.push(`Stale opportunity: ${age}ms old`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function computeMidnightMs(date = new Date()): number {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}

export function shouldResetDailyCounter(
  now: number,
  dailyTradeResetTime: number,
  midnightMs: number,
): boolean {
  return now > dailyTradeResetTime + 86400000 || now < midnightMs;
}
