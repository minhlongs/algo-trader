-- Migration 010: Citadel attestation + BYOK tables
-- Phase 01 Citadel Protocol MVP

CREATE TABLE IF NOT EXISTS subscriber_dids (
  id            TEXT PRIMARY KEY,             -- subscriber ID (UUID)
  did           TEXT NOT NULL UNIQUE,         -- did:key:<multibase-encoded-pubkey>
  public_key_hex TEXT NOT NULL,              -- Ed25519 public key hex
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS citadel_attestations (
  id              TEXT PRIMARY KEY,           -- UUID
  subscriber_id   TEXT NOT NULL,
  did             TEXT NOT NULL,
  measurement_hash TEXT NOT NULL,            -- SHA-256 of agent code blob
  mode            TEXT NOT NULL DEFAULT 'simulation', -- 'simulation'|'sgx'|'tdx'
  jwt_token       TEXT NOT NULL,             -- signed attestation JWT
  issued_at       INTEGER NOT NULL,          -- Unix epoch
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (subscriber_id) REFERENCES subscriber_dids(id)
);

CREATE TABLE IF NOT EXISTS byok_keys_wrapped (
  id              TEXT PRIMARY KEY,           -- UUID
  subscriber_id   TEXT NOT NULL,
  did             TEXT NOT NULL,
  kek_version     INTEGER NOT NULL DEFAULT 1, -- KEK version for rotation
  wrapped_dek     TEXT NOT NULL,             -- base64(KEK_encrypt(DEK))
  iv_hex          TEXT NOT NULL,             -- AES-GCM IV for outer wrap
  auth_tag_hex    TEXT NOT NULL,             -- AES-GCM auth tag
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (subscriber_id) REFERENCES subscriber_dids(id)
);

-- Audit log: every DEK unwrap operation
CREATE TABLE IF NOT EXISTS byok_unwrap_audit (
  id            TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  did           TEXT NOT NULL,
  kek_version   INTEGER NOT NULL,
  action        TEXT NOT NULL DEFAULT 'unwrap',
  actor_ip      TEXT,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_attestations_subscriber ON citadel_attestations(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_byok_subscriber ON byok_keys_wrapped(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_audit_subscriber ON byok_unwrap_audit(subscriber_id);
