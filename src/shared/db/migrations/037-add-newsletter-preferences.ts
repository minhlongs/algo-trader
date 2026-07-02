/**
 * Migration 037: Newsletter Preferences Table
 * Phase 34b Content Personalization — user segmentation for targeted emails.
 */
import { PoolClient } from 'pg';

export const id = '037-add-newsletter-preferences';
export const description =
  'Create newsletter_preferences table for email segmentation';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS newsletter_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      tenant_id TEXT,
      frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly','monthly','none')),
      interests TEXT[] NOT NULL DEFAULT '{}',
      topics TEXT NOT NULL DEFAULT 'all' CHECK (topics IN ('all','signals','strategies','performance','market-analysis')),
      verified BOOLEAN NOT NULL DEFAULT false,
      subscribed BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_newsletter_prefs_email ON newsletter_preferences(email)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_newsletter_prefs_subscribed ON newsletter_preferences(subscribed)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS newsletter_preferences');
}
