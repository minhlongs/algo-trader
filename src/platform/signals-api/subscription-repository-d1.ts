/**
 * Signal Subscription D1 Repository
 *
 * Single source of truth for all signal subscription persistence.
 * Replaces 3 separate in-memory implementations:
 *   src/api/routes/signal-subscription-router (legacy v1)
 *   src/platform/api/routes/signal-subscription-router (legacy v2)
 *   src/platform/signals-api/signal-subscription-service (stub)
 *
 * Uses the same postgres-client query() wrapper (works with D1/SQLite/Postgres).
 */

import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { SignalSubscription, TierLabel, SubscriptionStatus } from './signal-subscription-service';

// ── SQL helpers ───────────────────────────────────────────────────────────────

function rowToSubscription(row: {
	id: string;
	subscriber_id: string;
	chat_id: number | null;
	tier: string;
	status: string;
	active: number;
	created_at: number;
	updated_at: number;
	expires_at: number | null;
}): SignalSubscription {
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

// ── Repository ────────────────────────────────────────────────────────────────

export class SubscriptionRepositoryD1 {
	private initialized = false;

	async ensureTable(): Promise<void> {
		if (this.initialized) return;
		await query(`CREATE TABLE IF NOT EXISTS signal_subscriptions (
			id TEXT PRIMARY KEY,
			subscriber_id TEXT NOT NULL,
			chat_id BIGINT,
			tier TEXT NOT NULL DEFAULT 'FREE',
			status TEXT NOT NULL DEFAULT 'active',
			active INTEGER NOT NULL DEFAULT 1,
			created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
			updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
			expires_at BIGINT
		)`);
		await query(
			'CREATE INDEX IF NOT EXISTS idx_subs_active ON signal_subscriptions (active, tier)',
		);
		await query(
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_subscriber ON signal_subscriptions (subscriber_id)',
		);
		this.initialized = true;
		logger.info('[SubscriptionRepo] Table ensured');
	}

	/** Insert a new subscription. Throws on duplicate subscriber_id. */
	async create(input: {
		id: string;
		subscriberId: string;
		tier: TierLabel;
		chatId?: number;
		status?: SubscriptionStatus;
		expiresAt?: Date;
	}): Promise<SignalSubscription> {
		await this.ensureTable();
		const now = Date.now();
		const expiresAtMs = input.expiresAt?.getTime();

		// Upsert — handle re-subscribes gracefully
		await query(
			`INSERT INTO signal_subscriptions
				(id, subscriber_id, tier, status, active, chat_id, created_at, updated_at, expires_at)
			VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8)
			ON CONFLICT (subscriber_id) DO UPDATE SET
				tier = EXCLUDED.tier,
				status = EXCLUDED.status,
				active = EXCLUDED.active,
				chat_id = COALESCE(EXCLUDED.chat_id, signal_subscriptions.chat_id),
				updated_at = EXCLUDED.updated_at,
				expires_at = EXCLUDED.expires_at`,
			[
				input.id,
				input.subscriberId,
				input.tier,
				input.status ?? 'active',
				input.chatId ?? null,
				now,
				now,
				expiresAtMs,
			],
		);

		const row = await query<{
			id: string;
			subscriber_id: string;
			chat_id: number | null;
			tier: string;
			status: string;
			active: number;
			created_at: number;
			updated_at: number;
			expires_at: number | null;
		}>(
			'SELECT * FROM signal_subscriptions WHERE subscriber_id = $1',
			[input.subscriberId],
		);

		return rowToSubscription(row.rows[0]!);
	}

	/** Get subscription by subscriber_id. Returns undefined if not found. */
	async getBySubscriberId(subscriberId: string): Promise<SignalSubscription | undefined> {
		await this.ensureTable();
		const result = await query<{
			id: string;
			subscriber_id: string;
			chat_id: number | null;
			tier: string;
			status: string;
			active: number;
			created_at: number;
			updated_at: number;
			expires_at: number | null;
		}>(
			'SELECT * FROM signal_subscriptions WHERE subscriber_id = $1',
			[subscriberId],
		);
		return result.rows[0] ? rowToSubscription(result.rows[0]!) : undefined;
	}

	/** Get subscription by id. */
	async getById(id: string): Promise<SignalSubscription | undefined> {
		await this.ensureTable();
		const result = await query<{
			id: string;
			subscriber_id: string;
			chat_id: number | null;
			tier: string;
			status: string;
			active: number;
			created_at: number;
			updated_at: number;
			expires_at: number | null;
		}>('SELECT * FROM signal_subscriptions WHERE id = $1', [id]);
		return result.rows[0] ? rowToSubscription(result.rows[0]!) : undefined;
	}

	/** Soft-cancel: set active=0, status='cancelled'. */
	async cancel(subscriberId: string): Promise<boolean> {
		await this.ensureTable();
		const result = await query(
			`UPDATE signal_subscriptions
			 SET active = 0, status = 'cancelled', updated_at = $1
			 WHERE subscriber_id = $2 AND active = 1`,
			[Date.now(), subscriberId],
		);
		return (result.rowCount ?? 0) > 0;
	}

	/** Re-activate a cancelled subscription. */
	async reactivate(subscriberId: string, tier: TierLabel): Promise<SignalSubscription | undefined> {
		await this.ensureTable();
		const r = await query(
			`UPDATE signal_subscriptions
			 SET active = 1, status = 'active', tier = $1, updated_at = $2
			 WHERE subscriber_id = $3 AND active = 0`,
			[tier, Date.now(), subscriberId],
		);
		if ((r.rowCount ?? 0) === 0) return undefined;

		const row = await query<{
			id: string;
			subscriber_id: string;
			chat_id: number | null;
			tier: string;
			status: string;
			active: number;
			created_at: number;
			updated_at: number;
			expires_at: number | null;
		}>('SELECT * FROM signal_subscriptions WHERE subscriber_id = $1', [subscriberId]);
		return rowToSubscription(row.rows[0]!);
	}

	/** Get all active subscriptions (for Telegram fan-out). */
	async getActive(): Promise<SignalSubscription[]> {
		await this.ensureTable();
		const result = await query<{
			id: string;
			subscriber_id: string;
			chat_id: number | null;
			tier: string;
			status: string;
			active: number;
			created_at: number;
			updated_at: number;
			expires_at: number | null;
		}>(
			`SELECT * FROM signal_subscriptions
			 WHERE active = 1
			 ORDER BY created_at ASC`,
		);
		return result.rows.map(rowToSubscription);
	}

	/** Get active subscriptions for a specific tier (for rate-limit bookkeeping). */
	async getActiveByTier(tier: TierLabel): Promise<SignalSubscription[]> {
		await this.ensureTable();
		const result = await query<{
			id: string;
			subscriber_id: string;
			chat_id: number | null;
			tier: string;
			status: string;
			active: number;
			created_at: number;
			updated_at: number;
			expires_at: number | null;
		}>(
			`SELECT * FROM signal_subscriptions
			 WHERE active = 1 AND tier = $1
			 ORDER BY created_at ASC`,
			[tier],
		);
		return result.rows.map(rowToSubscription);
	}

	/** Count active subscriptions (for dashboard metrics). */
	async countActive(tier?: TierLabel): Promise<number> {
		await this.ensureTable();
		const sql =
			tier !== undefined
				? 'SELECT COUNT(*) as cnt FROM signal_subscriptions WHERE active = 1 AND tier = $1'
				: 'SELECT COUNT(*) as cnt FROM signal_subscriptions WHERE active = 1';
		const params = tier !== undefined ? [tier] : [];
		const result = await query<{ cnt: number }>(sql, params);
		return result.rows[0]?.cnt ?? 0;
	}
}

// Singleton
export const subscriptionRepo = new SubscriptionRepositoryD1();
