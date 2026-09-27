/**
 * Pre-trade risk guard for multi-exchange arbitrage execution.
 *
 * Enforces Quarter-Kelly position sizing (5% hard cap), notional and venue/symbol
 * open position caps, 15% daily drawdown circuit breakers, venue latency breakers,
 * and fail-closed paper vs live mode credential and balance validation.
 *
 * @module desk/arbitrage/arbitrage-risk-guard
 */

export * from './risk/arbitrage-risk-guard';
