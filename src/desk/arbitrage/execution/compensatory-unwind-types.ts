/**
 * Type definitions for CompensatoryUnwindHandler.
 *
 * @module desk/arbitrage/execution/compensatory-unwind-types
 */

import type { IExchangeConnector } from '../connectors/types';
import type { LegSide } from './execution-types-lifecycle';

export interface UnwindHandlerConfig {
  /** Maximum retry attempts for failed unwinds (default: 3) */
  maxRetries?: number;
  /** Initial backoff duration in ms before first retry (default: 20ms) */
  initialBackoffMs?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Whether to attempt emergency market liquidation on final attempt (default: true) */
  emergencyFallback?: boolean;
}

export type ConnectorResolver = (venue: string) => IExchangeConnector | undefined;

export interface UnwindEventPayload {
  unwindId: string;
  executionId: string;
  legId: string;
  venue: string;
  symbol: string;
  side: LegSide;
  amount: number;
  attempt?: number;
  error?: string;
  latencyMs?: number;
}
