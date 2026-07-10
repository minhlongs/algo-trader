// ──────────────────────────────────────────────────────────────────────────────
// index.ts — barrel export for RiskCalculation module
//
// Usage:
//   import { wireUpRiskCalculation } from '@/api/v1/risk/caculation';
//   wireUpRiskCalculation({ router, repository });
// ──────────────────────────────────────────────────────────────────────────────

export { TokenGuardService, RightsGuard } from './middleware/rightsGuard';
export {
  RiskCalculationService,
  RISK_CALCULATION_LIMIT_MIN,
  RISK_CALCULATION_LIMIT_DEFAULT,
  type RiskCalculationServiceOptions,
} from './service';
export type { Returnable } from './service';
export {
  RiskCalculationController,
  type RiskCalculationControllerOptions,
} from './controller';
export {
  RiskCalculationRepository,
  type RiskCalculationRepositoryOptions,
} from './repository';
export {
  LimitEnforcerServiceImpl,
  LimitExceededError,
  LimitEnforcerService,
  type RateLimiterBackend,
  type RateLimitEntry,
  type LimitEnforcerOptions,
} from './limit-enforcer';
export { createRiskCalculationErrorHandler } from './error-handler';
export { wireUpRiskCalculation, registerRiskCalculationRoute } from './handler';

// Types
export type {
  RiskLevel,
  SortDirection,
  RiskCalculationMetadata,
  RiskCalculationRequest,
  RiskCalculationResult,
  RiskCalculationPaginatedResponse,
  IdentifyResult,
  AppError,
} from './types';
export { isAppError, statusFor } from './types';
