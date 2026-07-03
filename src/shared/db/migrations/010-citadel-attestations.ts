/**
 * Migration 010: Citadel attestation + BYOK tables
 * Phase 01 Citadel Protocol MVP
 */

import { PoolClient } from 'pg';

export const id = '010-citadel-attestations';
export const description = 'Create Citadel attestation and BYOK key tables';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS subscriber_dids (
      id            TEXT PRIMARY KEY,
      did           TEXT NOT NULL UNIQUE,
      public_key_hex TEXT NOT NULL,
      created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      updated_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS citadel_attestations (
      id              TEXT PRIMARY KEY,
      subscriber_id   TEXT NOT NULL,
      did             TEXT NOT NULL,
      measurement_hash TEXT NOT NULL,
      mode            TEXT NOT NULL DEFAULT 'simulation',
      jwt_token       TEXT NOT NULL,
      issued_at       BIGINT NOT NULL,
      expires_at      BIGINT NOT NULL,
      created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      FOREIGN KEY (subscriber_id) REFERENCES subscriber_dids(id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS byok_keys_wrapped (
      id              TEXT PRIMARY KEY,
      subscriber_id   TEXT NOT NULL,
      did             TEXT NOT NULL,
      kek_version     INTEGER NOT NULL DEFAULT 1,
      wrapped_dek     TEXT NOT NULL,
      iv_hex          TEXT NOT NULL,
      auth_tag_hex    TEXT NOT NULL,
      created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      updated_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),
      FOREIGN KEY (subscriber_id) REFERENCES subscriber_dids(id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS byok_unwrap_audit (
      id            TEXT PRIMARY KEY,
      subscriber_id TEXT NOT NULL,
      did           TEXT NOT NULL,
      kek_version   INTEGER NOT NULL,
      action        TEXT NOT NULL DEFAULT 'unwrap',
      actor_ip      TEXT,
      created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_attestations_subscriber ON citadel_attestations(subscriber_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_byok_subscriber ON byok_keys_wrapped(subscriber_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_audit_subscriber ON byok_unwrap_audit(subscriber_id)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS byok_unwrap_audit CASCADE');
  await client.query('DROP TABLE IF EXISTS byok_keys_wrapped CASCADE');
  await client.query('DROP TABLE IF EXISTS citadel_attestations CASCADE');
  await client.query('DROP TABLE IF EXISTS subscriber_dids CASCADE');
}
