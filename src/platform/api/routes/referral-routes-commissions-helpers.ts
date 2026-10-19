/**
 * Referral Commission Routes — Validation and formatting helpers
 */

import { paginationSchema } from '../schemas/referral.schemas';
import type { CommissionRecord } from '../../referral/types';

export interface PayoutRecordItem {
  id: string;
  amount: number;
  currency: 'USD';
  stripePayoutId?: string | null;
  status: 'completed';
  periodStart: Date;
  periodEnd: Date;
  paidAt?: Date | null;
  commissionCount: number;
}

export function parseReferralPagination(query: Record<string, unknown>, includeStatus = false) {
  const { status, page = 1, limit = 50 } = query;
  const input = includeStatus ? { status, page, limit } : { page, limit };
  return paginationSchema.safeParse(input);
}

export function buildPaginatedResponse<T>(data: T[], page: number, limit: number, total?: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      ...(total !== undefined
        ? {
            total,
            totalPages: Math.ceil(total / limit),
          }
        : {}),
    },
  };
}

export function mapCommissionsToPayouts(commissions: CommissionRecord[]): PayoutRecordItem[] {
  return commissions
    .filter((c) => c.status === 'paid')
    .map((c) => ({
      id: c.id,
      amount: c.commissionAmount,
      currency: 'USD' as const,
      stripePayoutId: c.stripePayoutId,
      status: 'completed' as const,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      paidAt: c.paidAt,
      commissionCount: 1,
    }));
}
