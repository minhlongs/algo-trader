/**
 * Duffie-Singleton (1999) Defaultable Term Structure Suite
 *
 * Provides both:
 * 1. Stochastic CIR-hazard rate term structure (DuffieSingletonEngine)
 * 2. Closed-form RMV analytical pricing engine (DuffieSingletonRmvEngine)
 *
 * @module desk/duffiesingleton
 */

// Stochastic affine hazard rate model (original)
export * from './duffie-singleton-types';
export * from './duffie-singleton-math';
export { DuffieSingletonEngine } from './duffie-singleton-engine';

// Closed-form Recovery of Market Value (RMV) model
export type {
  DuffieSingletonConfig,
  DefaultableCouponPayment,
  DuffieSingletonEstimates,
} from './duffiesingleton-types';
export { DuffieSingletonMath as DuffieSingletonRmvMath } from './duffiesingleton-math';
export { DuffieSingletonEngine as DuffieSingletonRmvEngine } from './duffiesingleton-engine';
