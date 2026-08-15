/**
 * Risk Engine — Platform Service Layer
 *
 * Orchestrates portfolio risk management:
 * - VaR/CVaR (historical simulation + parametric)
 * - Correlation matrix (cached, 50-position cap)
 * - Drawdown monitor + Telegram alerts
 * - ATR trailing stops (per-position)
 * - Kelly Criterion position sizing
 *
 * Math engines: @desk/risk
 * Persistence: Redis (cache + state), Redis (alert history)
 * Feature flag: ENABLE_RISK_ENGINE
 *
 * Architecture:
 *   src/platform/risk/
 *   ├── types.ts                     (shared interfaces)
 *   ├── risk-engine.ts               (orchestrator, lazy-init services)
 *   ├── var-cvar-service.ts          (VaR wrapper)
 *   ├── correlation-matrix-service.ts (correlation wrapper)
 *   ├── drawdown-monitor-service.ts  (drawdown + alerting)
 *   ├── atr-trailing-stop-service.ts (ATR stop wrapper)
 *   ├── kelly-position-sizer-service.ts (Kelly wrapper)
 *   ├── risk-routes.ts               (/api/v1/risk/* Express routes)
 *   └── __tests__/                   (unit tests)
 */

export { RiskEngine } from './risk-engine';
export { VaRService } from './var-cvar-service';
export { CorrelationMatrixService } from './correlation-matrix-service';
export { DrawdownMonitorService } from './drawdown-monitor-service';
export { AtrTrailingStopService } from './atr-trailing-stop-service';
export { KellyPositionSizerService } from './kelly-position-sizer-service';

// Drawdown monitor extracted modules
export { DrawdownAlertTier, DEFAULT_THRESHOLD_CONFIG, computeDrawdownFraction, computeDailyDrawdownFraction, buildMetricsSnapshot } from './drawdown-monitor-types';
export type { DrawdownThresholdConfig, DrawdownThresholdEvaluation, DrawdownEvaluationResult, DrawdownStateSnapshot, DrawdownThrottleState, DrawdownAlertRecord } from './drawdown-monitor-types';
export { evaluateDailyDrawdown, evaluateTotalDrawdown, evaluateConsecutiveLosses, evaluateAllThresholds, determineAlertTier, shouldHaltTrading, buildAlerts, formatAlertMessage, formatHaltReason, shouldThrottleAlert, isWithinHaltPeriod, clampDrawdownValue, validateMetricsIntegrity } from './drawdown-monitor-evaluators';
export type { HaltDecision } from './drawdown-monitor-evaluators';

// Re-export types
export {
  RISK_FEATURE_FLAG,
  CACHE_KEYS,
  CACHE_TTL_SECONDS,
  ALERT_THROTTLE_MS,
  type RiskPosition,
  type VarRequest,
  type VarResponse,
  type CorrelationRequest,
  type CorrelationResponse,
  type DrawdownRequest,
  type DrawdownResponse,
  type AtrStopRequest,
  type AtrStopResponse,
  type KellySizingRequest,
  type KellySizingResponse,
  type AlertRecord,
} from './types';
