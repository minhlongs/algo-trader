/**
 * AI Signal Paper Router Types
 */

import type {
  AISignal,
  AISignalAdapter,
  AISignalValidationResult,
} from './ai-signal-adapter';
import type { RegimeAwareKelly } from '../risk/regime-aware-kelly';
import type { TieredDrawdownBreaker } from '../risk/tiered-drawdown-breaker';
import type {
  PaperTradeFillRecord,
  TradeSignal,
  ExecutionResult,
} from '../execution/paper-position-types';
import type { PaperExecutor } from '../execution/paper-executor';

export interface EquityPoint {
  timestamp: number;
  isoDate: string;
  balance: number;
  unrealizedPnl: number;
  realizedPnl: number;
  equity: number;
  highWaterMark: number;
  drawdown: number;
  maxDrawdown: number;
  openPositionsCount: number;
}

export type RoutingStatus =
  | 'FILLED'       // Order successfully executed in PaperExecutor
  | 'REJECTED'     // Signal failed validation, circuit breaker active, insufficient balance/inventory, or executor error
  | 'UNFILLED'     // Simulated liquidity failure (fill rate drop)
  | 'ZERO_SIZE';   // Position sizing produced zero allocation (e.g. SHOCK regime or below min size)

export interface SignalRoutingOutcome {
  status: RoutingStatus;
  signal: AISignal;
  symbol: string;
  marketPrice: number;
  validation: AISignalValidationResult;
  tradeSignal?: TradeSignal;
  executionResult?: ExecutionResult;
  fillRecord?: PaperTradeFillRecord;
  reason?: string;
  timestamp: number;
}

export interface AISignalPaperRouterConfig {
  adapter: AISignalAdapter;
  paperExecutor: PaperExecutor;
  regimeKelly?: RegimeAwareKelly;
  drawdownBreaker?: TieredDrawdownBreaker;
  defaultSymbol?: string;
  defaultWinLossRatio?: number;
  strictMaxCap?: boolean;
  minPositionUsd?: number;
}
