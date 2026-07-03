/**
 * Migration 048: Add billing enterprise inquiries table
 * Creates the enterprise_inquiries table for persistent enterprise contact form submissions.
 *
 * This stores enterprise sales inquiries with status tracking,
 * enabling enterprise deal pipeline management and TAM assignment.
 */
import { PoolClient } from 'pg';

export const id = '048-add-billing-enterprise-inquiries';
export const description = 'Create enterprise_inquiries table for enterprise sales pipeline persistence';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS enterprise_inquiries (
      id VARCHAR(128) PRIMARY KEY,
      email TEXT NOT NULL,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      tier VARCHAR(32) NOT NULL
        CHECK (tier IN ('PRO', 'ENTERPRISE', 'MASTER')),
      use_case TEXT NOT NULL,
      team_size TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'tam_notified', 'contacted', 'demo_active', 'negotiating', 'closed_won', 'closed_lost')),
      tam_assigned TEXT,
      paperdemo_provisioned BOOLEAN NOT NULL DEFAULT false,
      paperdemo_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_email
    ON enterprise_inquiries(email)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_status
    ON enterprise_inquiries(status)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_enterprise_inquiries_status');
  await client.query('DROP INDEX IF EXISTS idx_enterprise_inquiries_email');
  await client.query('DROP TABLE IF EXISTS enterprise_inquiries CASCADE');
}
