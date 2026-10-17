/**
 * Execution Path Planner Types
 *
 * @module desk/execution/execution-path-planner-types
 */

import type { FrankWolfeResult } from './multi-leg-frank-wolfe-optimizer';

/** Metadata about a leg used for ordering decisions */
export interface LegMetadata {
  marketId: string;
  side: 'YES' | 'NO';
  /** Available liquidity in USDC */
  liquidity: number;
  /** Urgency score 0–1 (higher = execute sooner) */
  urgency: number;
}

/** A single step in the execution plan */
export interface ExecutionStep {
  /** Sequential step number (1-indexed) */
  step: number;
  marketId: string;
  side: 'YES' | 'NO';
  /** Actual USDC size to execute at this step */
  sizeUsdc: number;
  /** Estimated slippage cost */
  estimatedSlippage: number;
  /** Reason for this position in the sequence */
  reason: string;
}

/** Full ordered execution plan for a basket */
export interface ExecutionPlan {
  basketId: string;
  steps: ExecutionStep[];
  totalEstimatedCost: number;
  /** Optimizer result if FW optimization was applied */
  optimization?: FrankWolfeResult;
  createdAt: number;
}
