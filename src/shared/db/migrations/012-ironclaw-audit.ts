/**
 * Migration 012: IronClaw DLP tables
 * dlp_patterns: rules loaded by pattern registry (admin-managed)
 * dlp_audit_log: hash-chained egress call records
 */

import { PoolClient } from 'pg';

export const id = '012-ironclaw-audit';
export const description = 'Create IronClaw DLP patterns and audit log tables';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dlp_patterns (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      pattern     TEXT NOT NULL,
      match_type  TEXT NOT NULL CHECK (match_type IN ('regex','substring')),
      action      TEXT NOT NULL CHECK (action IN ('allow','redact','block','alert')),
      scope       TEXT NOT NULL CHECK (scope IN ('url','header','body','any')),
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    INSERT INTO dlp_patterns (id, name, pattern, match_type, action, scope, enabled, created_at) VALUES
      ('p-sk',     'OpenAI/Stripe secret key',      'sk-[A-Za-z0-9_-]{20,}',   'regex',     'block', 'body', 1, NOW()),
      ('p-pk',     'Public API key prefix',          'pk-[A-Za-z0-9_-]{20,}',   'regex',     'redact','body', 1, NOW()),
      ('p-eth',    'Ethereum private key',           '0x[0-9a-fA-F]{64}',       'regex',     'block', 'body', 1, NOW()),
      ('p-email',  'Email address PII',              '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', 'regex', 'redact','body', 1, NOW()),
      ('p-bearer', 'Authorization Bearer token',     'Bearer [A-Za-z0-9._-]{20,}','regex',   'redact','header',1, NOW())
    ON CONFLICT (id) DO NOTHING
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS dlp_audit_log (
      id              TEXT PRIMARY KEY,
      subscriber_id   TEXT NOT NULL,
      url             TEXT NOT NULL,
      method          TEXT NOT NULL,
      action          TEXT NOT NULL CHECK (action IN ('allow','redact','block','alert')),
      pattern_id      TEXT,
      payload_hash    TEXT NOT NULL,
      prev_hash       TEXT NOT NULL,
      row_hash        TEXT NOT NULL,
      ts              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_dlp_audit_subscriber ON dlp_audit_log(subscriber_id, ts)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_dlp_audit_action ON dlp_audit_log(action, ts)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS dlp_audit_log CASCADE');
  await client.query('DROP TABLE IF EXISTS dlp_patterns CASCADE');
}
