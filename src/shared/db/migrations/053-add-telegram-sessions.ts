/**
 * Migration 053: Create telegram_sessions table
 * Persists Telegram user sessions in PostgreSQL for restart resilience.
 *
 * Replaces the in-memory Map in TelegramBotService with a proper DB-backed store,
 * ensuring linked license keys and notification preferences survive service restarts.
 */
import { PoolClient } from 'pg';

export const id = '053-add-telegram-sessions';
export const description = 'Create telegram_sessions table for persistent user sessions';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS telegram_sessions (
      user_id BIGINT PRIMARY KEY,
      license_keys TEXT[] NOT NULL DEFAULT '{}',
      notifications_enabled BOOLEAN NOT NULL DEFAULT true,
      last_command VARCHAR(64) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_telegram_sessions_license_keys
    ON telegram_sessions USING GIN (license_keys)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_telegram_sessions_updated_at
    ON telegram_sessions(updated_at)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_telegram_sessions_license_keys');
  await client.query('DROP INDEX IF EXISTS idx_telegram_sessions_updated_at');
  await client.query('DROP TABLE IF EXISTS telegram_sessions CASCADE');
}
