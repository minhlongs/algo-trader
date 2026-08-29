// TradingPipeline — types & defaults.
// Paper trading is the DEFAULT mode (safe). Set paperTrading: false for live execution.
import type { StrategyConfig } from '../core/types';

export interface PipelineConfig {
  /** Paper trading mode — defaults to true (safe) */
  paperTrading?: boolean;
  /** Polymarket ECDSA private key (required for live mode) */
  privateKey?: string;
  chainId?: number;
  /** Total capital allocated across strategies, USDC string */
  capitalUsdc?: string;
  dbPath?: string;
  strategies?: StrategyConfig[];
}

export type PipelineStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export const DEFAULT_CAPITAL = '1000';
export const DEFAULT_DB_PATH = 'data/algo-trade.db';

export const DEFAULT_STRATEGIES: StrategyConfig[] = [
  { name: 'cross-market-arb', enabled: true, capitalAllocation: '100', params: { defaultSizeUsdc: 50, scanIntervalMs: 10_000 } },
  { name: 'market-maker',     enabled: true, capitalAllocation: '400', params: { quoteSizeUsdc: 25, refreshIntervalMs: 20_000 } },
  { name: 'mean-reversion',   enabled: true, capitalAllocation: '200', params: { sizeUsdc: 50, spikeThreshold: 0.15, scanIntervalMs: 60_000 } },
];
