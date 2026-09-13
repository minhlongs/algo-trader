/**
 * Reflection Engine Types and Constants
 * Outcome interfaces, parameter adjustment structures, and thresholds
 */

export interface TradeOutcome {
  tradeId: string;
  marketId: string;
  strategy: string;
  side: 'YES' | 'NO';
  entryPrice: number;
  exitPrice: number | null;
  pnl: number;
  expectedEdge: number;
  actualEdge: number;
  executionLatency: number; // ms from signal to fill
  timestamp: number;
}

export interface ReflectionResult {
  level1_logic: {
    executedCorrectly: boolean;
    deviations: string[];
  };
  level2_outcome: {
    profitable: boolean;
    pnl: number;
    edgeAccuracy: number; // actualEdge / expectedEdge ratio
    lesson: string;
  };
  parameterAdjustments: Array<{
    param: string;
    currentValue: number;
    suggestedValue: number;
    reason: string;
  }>;
}

export interface RawL2 {
  lesson?: string;
  parameterAdjustments?: Array<{
    param?: string;
    currentValue?: number;
    suggestedValue?: number;
    reason?: string;
  }>;
}

export const SLIPPAGE_WARN_PCT = 0.02; // 2% edge deviation triggers deviation flag
export const LATENCY_WARN_MS = 500;
export const RING_BUFFER_SIZE = 100;
export const REFLECTION_TOPIC = 'intelligence.reflection.completed';
