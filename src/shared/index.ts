/**
 * Shared Kernel — root barrel
 *
 * Import rules:
 *   shared/ → NOTHING in desk/ or platform/ (compiler enforced)
 *   desk/   → shared/ only
 *   platform/ → shared/ only
 *
 * All exports are infrastructure primitives — zero business logic.
 */

// Types
export {
  LicenseTier,
  LicenseStatus,
  RelationType,
  type License,
  type LicenseAnalytics,
  type LicenseActivity,
  type CreateLicenseInput,
  type LicenseFilters,
  type LicenseListResponse,
  type MarketOpportunity,
  type ILPVariable,
  type ILPConstraint,
  type ILPSolverConfig,
  type ILPPosition,
  type HedgePosition,
  type DeltaNeutralPortfolio,
  type PositionDelta,
  type PortfolioDeltaResult,
  type RebalanceSignal,
  type MarketRelationship,
  type DependencyGraph,
  type GammaMarket,
  type MarketPromptBatch,
} from './types';

// Config
export { config, validateEnvVars, logConfigStatus, loadLlmConfig } from './config';
export type { LlmEndpoint, LlmConfig } from './config';

// DB
export {
  getDbClient,
  query,
  transaction,
  closeDbConnection,
  runMigrations,
  type DbConfig,
  type DbRow,
} from './db';

// Utils
export { logger, computeHmacSha256, verifyHmacSha256, initSentry, initTracing } from './utils';

// Persistence
export { cashclawPath, appendJsonl, readJsonl, writeJsonState, readJsonState } from './persistence';

// Messaging
export {
  createMessageBus,
  getMessageBus,
  closeMessageBus,
  connectNats,
  closeNats,
  isNatsConnected,
  getNatsConnection,
  NatsMessageBus,
  RedisMessageBus,
  type IMessageBus,
  type MessageEnvelope,
  type MessageHandler,
} from './messaging';

// Resilience
export {
  TokenBucket,
  RateLimiterRegistry,
  rateLimiterRegistry,
  CircuitBreaker,
  CircuitOpenError,
  RecoveryManager,
  recoveryManager,
  type CircuitState,
  type CircuitBreakerOptions,
  type CircuitBreakerStatus,
  type RecoveryState,
} from './resilience';
