/**
 * Desk Risk Module
 * Cross-engine risk guard, VaR/CVaR, leverage controls, circuit breakers, and engine synchronization.
 */

// Core Cross-Engine Risk Guard (M2)
export * from './portfolio-risk-types';
export * from './cross-engine-var-cvar';
export * from './tail-divergence';
export * from './leverage-exposure-guard';
export * from './global-circuit-breaker';
export * from './engine-synchronizer';

// Legacy and Engine-Specific Risk Utilities
export * from './circuit-breaker';
export * from './position-manager';
export * from './drawdown-monitor';
export * from './kelly-position-sizer';
export * from './tiered-drawdown-breaker';
export * from './portfolio-correlation';
export * from './value-at-risk';
export * from './atr-trailing-stop';
export * from './risk-gate-manager';
export * from './equity-snapshot-manager';
export * from './portfolio-rebalance-guard';
export * from '../../shared/persistence/file-store';
