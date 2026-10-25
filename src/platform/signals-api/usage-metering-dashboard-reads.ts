/**
 * The reporting surface of the usage meter: reads that back the counters the
 * request path wrote, for the revenue dashboard and the subscription APIs.
 *
 * Kept apart from `usage-metering-service-core.ts` for the file-size ceiling.
 * Every function delegates to `usage-metering-reporting-domain.ts`, so these
 * reads and the quota decision still see one durable row.
 */

import type { UsageSnapshot, UsageMetrics, UsageStatusView } from './usage-metering-types';
import {
	getMetrics as getMetricsFromStore,
	getRevenueSummary as getRevenueSummaryFromStore,
	getAllUsageData as getAllUsageDataFromStore,
} from './usage-metering-reporting-domain';
import {
	getSnapshot as getSnapshotFromStore,
	getTierBreakdown as getTierBreakdownFromStore,
} from './usage-metering-queries';

/** One tier's share of usage this period. */
export type TierBreakdown = Record<string, number>;

/** The revenue summary shape the dashboard reads. */
export interface RevenueSummary {
	subscriptionRevenue: number;
	overageRevenue: number;
	totalRevenue: number;
	customerCount: number;
	averageRevenuePerCustomer: number;
}

/** Get full usage snapshot for a subscriber. */
export async function readSnapshot(subscriberId: string): Promise<UsageSnapshot | undefined> {
	return getSnapshotFromStore(subscriberId);
}

/** Trade-volume counters for a subscriber this period. */
export async function readMetrics(subscriberId: string): Promise<UsageMetrics> {
	return getMetricsFromStore(subscriberId);
}

/** Get per-tier usage breakdown (for dashboard). */
export async function readTierBreakdown(): Promise<TierBreakdown> {
	return getTierBreakdownFromStore();
}

/**
 * Revenue summary for a period, computed from the same durable rows the
 * quota gate reads — never from a second store.
 */
export async function readRevenueSummary(period?: string): Promise<RevenueSummary> {
	return getRevenueSummaryFromStore(period);
}

/** Every subscriber with usage this period, for the revenue dashboard. */
export async function readAllUsageData(period?: string): Promise<UsageStatusView[]> {
	return getAllUsageDataFromStore(period);
}
