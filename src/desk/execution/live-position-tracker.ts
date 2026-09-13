/**
 * Live Position Tracker (Facade)
 *
 * Tracks Polymarket positions (ERC-1155 token balances) with unrealized/realized P&L.
 * Uses midpoint pricing from orderbook snapshots for mark-to-market valuation.
 *
 * Polymarket positions are token-ID-based (not symbol/exchange like the Redis
 * PositionManager). Each position represents an outcome token balance from a
 * filled CLOB order.
 */

export type {
  LivePosition,
  FilledOrder,
  PositionSummary,
} from './live-position-tracker-types';

export {
  LivePositionTracker,
} from './live-position-tracker-core';
