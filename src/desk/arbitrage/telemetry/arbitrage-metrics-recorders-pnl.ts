/**
 * Slippage and PnL recorder functions for arbitrage telemetry:
 * recordArbSlippage(), recordArbPnl().
 *
 * @module desk/arbitrage/telemetry/arbitrage-metrics-recorders-pnl
 */

import {
  arbSlippageBps,
  arbPnlUsd,
} from './arbitrage-metrics-definitions';

// ── 3. Slippage Recorder ─────────────────────────────────────────────────────

export interface RecordArbSlippageParams {
  strategyType?: string;
  venue: string;
  symbol: string;
  side?: string;
  slippageBps: number;
}

export function recordArbSlippage(params: RecordArbSlippageParams): void;
export function recordArbSlippage(
  strategyType: string,
  venue: string,
  symbol: string,
  side: string,
  slippageBps: number,
): void;
export function recordArbSlippage(
  strategyOrParams: string | RecordArbSlippageParams,
  venueOrSymbol?: string,
  symbolOrSlippage?: string | number,
  side?: string,
  slippageBps?: number,
): void {
  if (typeof strategyOrParams === 'object') {
    arbSlippageBps.observe(
      {
        strategy_type: strategyOrParams.strategyType ?? 'cross-exchange',
        venue: strategyOrParams.venue,
        symbol: strategyOrParams.symbol,
        side: strategyOrParams.side ?? 'buy',
      },
      strategyOrParams.slippageBps,
    );
  } else if (typeof symbolOrSlippage === 'number') {
    arbSlippageBps.observe(
      {
        strategy_type: 'cross-exchange',
        venue: strategyOrParams,
        symbol: venueOrSymbol ?? 'UNKNOWN',
        side: side ?? 'buy',
      },
      symbolOrSlippage,
    );
  } else {
    arbSlippageBps.observe(
      {
        strategy_type: strategyOrParams,
        venue: venueOrSymbol ?? 'unknown',
        symbol: (symbolOrSlippage as string) ?? 'UNKNOWN',
        side: side ?? 'buy',
      },
      slippageBps ?? 0,
    );
  }
}

// ── 4. PnL Recorder ──────────────────────────────────────────────────────────

export interface RecordArbPnlParams {
  strategyType?: string;
  venuePair?: string;
  result?: 'win' | 'loss' | 'unwound_loss' | string;
  pnlUsd: number;
}

export function recordArbPnl(params: RecordArbPnlParams): void;
export function recordArbPnl(
  strategyType: string,
  venuePair: string,
  result: string,
  pnlUsd: number,
): void;
export function recordArbPnl(
  strategyOrParams: string | RecordArbPnlParams,
  venuePairOrPnl?: string | number,
  resultOrPnl?: string | number,
  pnlUsd?: number,
): void {
  if (typeof strategyOrParams === 'object') {
    const res =
      strategyOrParams.result ?? (strategyOrParams.pnlUsd >= 0 ? 'win' : 'loss');
    arbPnlUsd.set(
      {
        strategy_type: strategyOrParams.strategyType ?? 'cross-exchange',
        venue_pair: strategyOrParams.venuePair ?? 'cross-venue',
        result: res,
      },
      strategyOrParams.pnlUsd,
    );
  } else if (typeof venuePairOrPnl === 'number') {
    const pnl = venuePairOrPnl;
    arbPnlUsd.set(
      {
        strategy_type: strategyOrParams,
        venue_pair: 'cross-venue',
        result: pnl >= 0 ? 'win' : 'loss',
      },
      pnl,
    );
  } else {
    const pnl = pnlUsd ?? 0;
    const res =
      typeof resultOrPnl === 'string'
        ? resultOrPnl
        : pnl >= 0
          ? 'win'
          : 'loss';
    arbPnlUsd.set(
      {
        strategy_type: strategyOrParams,
        venue_pair: (venuePairOrPnl as string) ?? 'cross-venue',
        result: res,
      },
      pnl,
    );
  }
}
