-- Migration 012: IronClaw DLP tables
-- dlp_patterns: rules loaded by pattern registry (admin-managed)
-- dlp_audit_log: hash-chained egress call records

CREATE TABLE IF NOT EXISTS dlp_patterns (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  pattern     TEXT NOT NULL,        -- regex or literal substring
  match_type  TEXT NOT NULL CHECK (match_type IN ('regex','substring')),
  action      TEXT NOT NULL CHECK (action IN ('allow','redact','block','alert')),
  scope       TEXT NOT NULL CHECK (scope IN ('url','header','body','any')),
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default seeds (API keys, private keys, email PII)
INSERT OR IGNORE INTO dlp_patterns VALUES
  ('p-sk',     'OpenAI/Stripe secret key',      'sk-[A-Za-z0-9_-]{20,}',   'regex',     'block', 'body', 1, datetime('now')),
  ('p-pk',     'Public API key prefix',          'pk-[A-Za-z0-9_-]{20,}',   'regex',     'redact','body', 1, datetime('now')),
  ('p-eth',    'Ethereum private key',           '0x[0-9a-fA-F]{64}',       'regex',     'block', 'body', 1, datetime('now')),
  ('p-email',  'Email address PII',              '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
                                                                             'regex',     'redact','body', 1, datetime('now')),
  ('p-bearer', 'Authorization Bearer token',    'Bearer [A-Za-z0-9._-]{20,}','regex',    'redact','header',1, datetime('now'));

CREATE TABLE IF NOT EXISTS dlp_audit_log (
  id              TEXT PRIMARY KEY,
  subscriber_id   TEXT NOT NULL,
  url             TEXT NOT NULL,
  method          TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('allow','redact','block','alert')),
  pattern_id      TEXT,             -- which pattern triggered (NULL = no match)
  payload_hash    TEXT NOT NULL,    -- sha256 of outbound body
  prev_hash       TEXT NOT NULL,    -- hash-chain link ('' for first row)
  row_hash        TEXT NOT NULL,    -- sha256(prev_hash + id + action + payload_hash)
  ts              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dlp_audit_subscriber ON dlp_audit_log(subscriber_id, ts);
CREATE INDEX IF NOT EXISTS idx_dlp_audit_action ON dlp_audit_log(action, ts);
