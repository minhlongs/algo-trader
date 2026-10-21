/**
 * Revenue Share Query Builder
 *
 * Dynamic WHERE/ORDER/LIMIT assembly for revenue-share listing queries.
 * Extracted from the repository so the paginated count + page pair is built from
 * one clause set and can never drift between the two statements.
 */

import type { RevenueShareStatus, PaginationParams, SortOrder } from '../models/types';

/** PostgreSQL query parameter types */
export type SqlParam = string | number | boolean | null | Date;

export interface RevenueShareFilters {
  strategyId?: string;
  tenantId?: string;
  subscriptionId?: string;
  status?: RevenueShareStatus;
  periodStart?: Date;
  periodEnd?: Date;
}

/** A built query: SQL fragment, bound parameters, and the next free index. */
export interface BuiltQuery {
  whereClause: string;
  params: SqlParam[];
  /** 1-based index of the next unbound $ placeholder. */
  nextIndex: number;
}

/** Column mapping from filter key to revenue-share column. */
const FILTER_COLUMNS: Record<keyof RevenueShareFilters, string> = {
  strategyId: 'strategy_id',
  tenantId: 'tenant_id',
  subscriptionId: 'subscription_id',
  status: 'status',
  periodStart: 'period_start',
  periodEnd: 'period_end',
};

/** Operator per filter key — date bounds are inequalities, the rest are equalities. */
const FILTER_OPERATORS: Record<keyof RevenueShareFilters, string> = {
  strategyId: '=',
  tenantId: '=',
  subscriptionId: '=',
  status: '=',
  periodStart: '>=',
  periodEnd: '<=',
};

/**
 * Build the WHERE clause and bound params for the provided filters. Only filters
 * with a value are included, so the param array indexes stay contiguous.
 */
export function buildRevenueShareWhere(filters: RevenueShareFilters | undefined): BuiltQuery {
  const conditions: string[] = [];
  const params: SqlParam[] = [];
  let idx = 1;

  for (const key of Object.keys(FILTER_COLUMNS) as Array<keyof RevenueShareFilters>) {
    const value = filters?.[key];
    if (value === undefined) continue;
    conditions.push(`${FILTER_COLUMNS[key]} ${FILTER_OPERATORS[key]} $${idx++}`);
    params.push(value);
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    nextIndex: idx,
  };
}

/** Resolved pagination window with 1-based page normalized to an offset. */
export interface ResolvedPagination {
  limit: number;
  page: number;
  offset: number;
}

/** Default page size when the caller does not request one. */
const DEFAULT_PAGE_LIMIT = 20;

/** Resolve the requested page window, defaulting to page 1 / limit 20. */
export function resolvePagination(pagination?: PaginationParams): ResolvedPagination {
  const limit = pagination?.limit ?? DEFAULT_PAGE_LIMIT;
  const page = pagination?.page ?? 1;
  return { limit, page, offset: (page - 1) * limit };
}

/** ORDER BY clause for a listing, defaulting to newest period first. */
export function buildRevenueShareOrder(sort?: { field: string; order: SortOrder }): string {
  const sortField = sort?.field || 'period_start';
  const sortOrder = sort?.order || 'desc';
  return `ORDER BY ${sortField} ${sortOrder}`;
}
