/**
 * Type definitions for the master Automated Multi-Exchange Arbitrage Execution Engine.
 *
 * @module desk/arbitrage/engine/arbitrage-engine-types
 */

import type { ArbitrageRiskConfig } from '../arbitrage-risk-guard';
import type { IngestionMetrics } from '../opportunity-ingestion-pipeline';

export interface ArbitrageEngineConfig {
  mode: 'dry-run' | 'live';
  riskConfig?: Partial<ArbitrageRiskConfig>;
  minNetProfitBps?: number;
  maxSlippageBps?: number;
  symbols?: string[];
  venues?: string[];
}

export interface ArbitrageOpportunity {
  id: string;
  symbol?: string;
  type?: string;
  buyVenue?: string;
  sellVenue?: string;
  buyExchange?: string;
  sellExchange?: string;
  venues?: string[];
  buyPrice?: number;
  sellPrice?: number;
  tradeSize?: number;
  maxTradeSize?: number;
  amount?: number;
  spread?: number;
  spreadPercent?: number;
  spreadBps?: number;
  netProfitBps?: number;
  netProfitUsd?: number;
  expectedProfit?: number;
  expectedProfitPct?: number;
  estimatedGasUsd?: number;
  confidence?: number | 'high' | 'medium' | 'low';
  timestamp?: number;
  legs?: Array<{
    exchange?: string;
    venue?: string;
    symbol: string;
    side: 'buy' | 'sell';
    price: number;
    amount: number;
    fee?: number;
  }>;
}

export interface ArbitrageEngineStatus {
  running: boolean;
  mode: 'dry-run' | 'live';
  activeExecutions: number;
  ingestionMetrics: IngestionMetrics;
  auditChainLength: number;
  lastExecutionTimestamp?: number;
}
