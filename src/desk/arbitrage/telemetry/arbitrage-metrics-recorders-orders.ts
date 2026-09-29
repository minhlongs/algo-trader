/**
 * Order and latency recorder functions for arbitrage telemetry:
 * recordArbOrder(), recordArbLatency().
 *
 * @module desk/arbitrage/telemetry/arbitrage-metrics-recorders-orders
 */

import {
  arbOrdersTotal,
  arbExecutionLatencyMs,
} from './arbitrage-metrics-definitions';

// ── 1. Order Recorder ────────────────────────────────────────────────────────

export interface RecordArbOrderParams {
  strategyType?: string;
  venue: string;
  leg?: string;
  side?: 'buy' | 'sell' | string;
  status: string;
  mode?: string;
}

export function recordArbOrder(params: RecordArbOrderParams): void;
export function recordArbOrder(
  strategyType: string,
  venue: string,
  leg: string,
  side: string,
  status: string,
  mode: string,
): void;
export function recordArbOrder(
  strategyOrParams: string | RecordArbOrderParams,
  venue?: string,
  leg?: string,
  side?: string,
  status?: string,
  mode?: string,
): void {
  if (typeof strategyOrParams === 'object') {
    arbOrdersTotal.inc({
      strategy_type: strategyOrParams.strategyType ?? 'cross-exchange',
      venue: strategyOrParams.venue,
      leg: strategyOrParams.leg ?? 'leg1',
      side: strategyOrParams.side ?? 'buy',
      status: strategyOrParams.status,
      mode: strategyOrParams.mode ?? 'dry-run',
    });
  } else {
    arbOrdersTotal.inc({
      strategy_type: strategyOrParams,
      venue: venue ?? 'unknown',
      leg: leg ?? 'leg1',
      side: side ?? 'buy',
      status: status ?? 'submitted',
      mode: mode ?? 'dry-run',
    });
  }
}

// ── 2. Latency Recorder ──────────────────────────────────────────────────────

export interface RecordArbLatencyParams {
  strategyType?: string;
  phase?: string;
  status?: string;
  latencyMs: number;
}

export function recordArbLatency(params: RecordArbLatencyParams): void;
export function recordArbLatency(
  strategyType: string,
  phase: string,
  status: string,
  latencyMs: number,
): void;
export function recordArbLatency(
  strategyOrParams: string | RecordArbLatencyParams,
  phaseOrLatency?: string | number,
  status?: string,
  latencyMs?: number,
): void {
  if (typeof strategyOrParams === 'object') {
    arbExecutionLatencyMs.observe(
      {
        strategy_type: strategyOrParams.strategyType ?? 'cross-exchange',
        phase: strategyOrParams.phase ?? 'roundtrip',
        status: strategyOrParams.status ?? 'success',
      },
      Math.max(0, strategyOrParams.latencyMs),
    );
  } else if (typeof phaseOrLatency === 'number') {
    arbExecutionLatencyMs.observe(
      {
        strategy_type: strategyOrParams,
        phase: 'roundtrip',
        status: status ?? 'success',
      },
      Math.max(0, phaseOrLatency),
    );
  } else {
    arbExecutionLatencyMs.observe(
      {
        strategy_type: strategyOrParams,
        phase: phaseOrLatency ?? 'roundtrip',
        status: status ?? 'success',
      },
      Math.max(0, latencyMs ?? 0),
    );
  }
}
