/**
 * RaaS (Research-as-a-Service) module barrel
 * Exports all subscriber-scoped services for Phase 06.
 */

export { SubscriberExecutor } from './subscriber-executor';
export type { SubscriberExecRequest, SubscriberExecResult } from './subscriber-executor';

export { SubscriberPnLAggregator } from './subscriber-pnl-aggregator';
export type { SubscriberPnLSummary, SubscriberDailyPnL } from './subscriber-pnl-aggregator';

export { SubscriberEquityCurveBuilder } from './subscriber-equity-curve-builder';
export type { EquityCurvePoint, EquityCurveResult } from './subscriber-equity-curve-builder';

export { SubscriberActivityMetricsService } from './subscriber-activity-metrics';
export type { SubscriberActivityMetrics } from './subscriber-activity-metrics';

export {
  buildTenantFilter,
  tenantQuery,
  assertTenantAccess,
} from './subscriber-tenant-isolator';
export type { TenantFilter } from './subscriber-tenant-isolator';
