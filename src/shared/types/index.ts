/**
 * Shared Types — barrel export
 * All shared type definitions used by desk/ and platform/.
 */

export {
  LicenseTier,
  LicenseStatus,
  type License,
  type LicenseAnalytics,
  type LicenseActivity,
  type CreateLicenseInput,
  type LicenseFilters,
  type LicenseListResponse,
} from './license';

export type {
  MarketOpportunity,
  ILPVariable,
  ILPConstraint,
  ILPSolverConfig,
  ILPPosition,
} from './ilp-types';

export type {
  HedgePosition,
  DeltaNeutralPortfolio,
  PositionDelta,
  PortfolioDeltaResult,
  RebalanceSignal,
} from './delta-neutral-types';

export {
  RelationType,
  type MarketRelationship,
  type DependencyGraph,
  type GammaMarket,
  type MarketPromptBatch,
} from './semantic-relationships';
