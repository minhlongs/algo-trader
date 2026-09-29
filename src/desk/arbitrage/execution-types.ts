/**
 * Types, Zod schemas, and data structures for atomic multi-leg arbitrage execution.
 *
 * Enforces the formal 6-state execution lifecycle:
 * PENDING -> SUBMITTED -> FILLED | PARTIAL_UNWINDING -> UNWOUND | FAILED
 *
 * @module desk/arbitrage/execution-types
 */

export * from './execution/execution-types-lifecycle';
export * from './execution/execution-types-reports';
