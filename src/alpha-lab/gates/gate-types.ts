/**
 * Gate Types
 *
 * Structured types for the 10 transition-criteria gates.
 * Each gate evaluates one eligibility criterion for paper-to-live promotion.
 */

export type GateId =
  | 'duration'
  | 'trade_count'
  | 'win_rate'
  | 'profit_factor'
  | 'max_drawdown'
  | 'sharpe_ratio'
  | 'oos_consistency'
  | 'kelly_wired'
  | 'circuit_breaker'
  | 'exchange_connectivity'
  | 'statistical_significance';

export interface GateThreshold {
  /** Gate identifier */
  id: GateId;
  /** Human-readable name */
  name: string;
  /** Threshold description (e.g. ">= 30 days") */
  description: string;
  /** Numeric threshold (null for boolean gates) */
  threshold: number | null;
  /** Whether the condition is "at least" (true) or "at most" (false). Null for boolean gates. */
  direction: 'at_least' | 'at_most' | null;
}

export interface GateStatus {
  /** Gate identifier */
  id: GateId;
  /** Human-readable name */
  name: string;
  /** Current computed value (null for boolean gates or missing data) */
  currentValue: number | null;
  /** Threshold from transition-criteria.md */
  threshold: number | null;
  /** Whether the gate is currently passing */
  passed: boolean;
  /** Free-form details about why the gate passed or failed */
  details: string;
}

export interface PromotionReadiness {
  /** Timestamp of this evaluation */
  evaluatedAt: string;
  /** All 10 gate statuses */
  gates: GateStatus[];
  /** True if every gate is passing */
  allPassed: boolean;
  /** Number of gates currently passing */
  passedCount: number;
  /** Total number of gates */
  totalGates: number;
  /** Estimated days remaining until all numeric gates pass (null if unknown) */
  estimatedDaysRemaining: number | null;
}

export interface GateTransition {
  /** Gate that changed */
  gateId: GateId;
  /** Previous pass/fail state */
  wasPassed: boolean;
  /** New pass/fail state */
  nowPassed: boolean;
  /** Value at time of transition */
  value: number | null;
  /** ISO timestamp */
  timestamp: string;
}

// ── Thresholds (from docs/transition-criteria.md) ──────────────────────────────

export const GATE_THRESHOLDS: GateThreshold[] = [
  {
    id: 'duration',
    name: 'Paper Trading Duration',
    description: '>= 30 calendar days',
    threshold: 30,
    direction: 'at_least',
  },
  {
    id: 'trade_count',
    name: 'Total Paper Trades',
    description: '>= 50 trades',
    threshold: 50,
    direction: 'at_least',
  },
  {
    id: 'win_rate',
    name: 'Win Rate',
    description: '>= 55%',
    threshold: 0.55,
    direction: 'at_least',
  },
  {
    id: 'profit_factor',
    name: 'Profit Factor',
    description: '>= 1.3',
    threshold: 1.3,
    direction: 'at_least',
  },
  {
    id: 'max_drawdown',
    name: 'Max Drawdown',
    description: '<= 15%',
    threshold: 0.15,
    direction: 'at_most',
  },
  {
    id: 'sharpe_ratio',
    name: 'Sharpe Ratio',
    description: '>= 1.0',
    threshold: 1.0,
    direction: 'at_least',
  },
  {
    id: 'oos_consistency',
    name: 'Out-of-Sample Consistency',
    description: 'testWinRate > valWinRate - 0.05',
    threshold: 0.05,
    direction: 'at_most',
  },
  {
    id: 'kelly_wired',
    name: 'Regime-Aware Kelly Wired',
    description: 'Boolean: Kelly criterion wired',
    threshold: null,
    direction: null,
  },
  {
    id: 'circuit_breaker',
    name: 'Circuit Breaker Tested',
    description: 'Boolean: circuit breaker tested',
    threshold: null,
    direction: null,
  },
  {
    id: 'exchange_connectivity',
    name: 'Exchange Connectivity',
    description: 'Boolean: all target exchanges green',
    threshold: null,
    direction: null,
  },
];
