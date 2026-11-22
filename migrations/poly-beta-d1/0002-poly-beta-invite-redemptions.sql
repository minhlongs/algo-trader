-- 0002-poly-beta-invite-redemptions.sql
-- Atomic single-use invite redemption ledger for Private Paper Beta.
-- Stores only the SHA-256 digest of the invite token (never plaintext) and enforces
-- single-use consumption atomically via PRIMARY KEY (token_hash) inside the signup
-- genesis batch transaction. Do NOT apply to production without Founder approval.

CREATE TABLE IF NOT EXISTS beta_invite_redemptions (
  token_hash      TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  tenant_id       TEXT NOT NULL,
  redeemed_at_ms  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_beta_invite_redemptions_email ON beta_invite_redemptions(email);
