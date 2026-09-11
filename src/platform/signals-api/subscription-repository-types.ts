/**
 * Signal Subscription D1 Repository Types
 */

import type { DbRow } from '../../db/postgres-client';
import type { SignalSubscription, TierLabel, SubscriptionStatus } from './signal-subscription-service';

export interface SubscriptionDbRow extends DbRow {
  id: string;
  subscriber_id: string;
  chat_id: number | null;
  tier: string;
  status: string;
  active: number;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

export interface CreateSubscriptionInput {
  id: string;
  subscriberId: string;
  tier: TierLabel;
  chatId?: number;
  status?: SubscriptionStatus;
  expiresAt?: Date;
}

export function rowToSubscription(row: SubscriptionDbRow): SignalSubscription {
  return {
    id: row.id,
    tenantId: row.subscriber_id,
    tier: row.tier as TierLabel,
    status: (row.status || 'active') as SubscriptionStatus,
    webhookUrl: null,
    chatId: row.chat_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}
