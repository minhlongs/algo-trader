-- 0006-referral-payout-history: Separated payout tracking from referral commissions
-- Applied via: psql -f migrations/0006-referral-payout-history.sql

-- Referral earnings per tenant (cumulative tracking)
CREATE TABLE IF NOT EXISTS referral_earnings (
  tenant_id        TEXT PRIMARY KEY,
  total_earned     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_paid_out   NUMERIC(12,2) NOT NULL DEFAULT 0,
  pending_balance  NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_payout_at   TIMESTAMPTZ,
  payout_method    TEXT,          -- crypto_btc|crypto_eth|crypto_usdt|bank_wire|bank_ach
  payout_address   TEXT,          -- wallet address or bank account identifier
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_earnings_pending
  ON referral_earnings(pending_balance)
  WHERE pending_balance > 0;

-- Payout history (individual payout transactions)
CREATE TABLE IF NOT EXISTS payout_history (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  amount           NUMERIC(12,2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'usd',
  method           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  commission_ids   TEXT[] NOT NULL DEFAULT '{}',
  transaction_id   TEXT,
  payout_address   TEXT NOT NULL,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  error            TEXT
);

CREATE INDEX IF NOT EXISTS idx_payout_history_tenant
  ON payout_history(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payout_history_status
  ON payout_history(status)
  WHERE status IN ('pending', 'processing');

-- Foreign key reference to referral_commissions (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'referral_commissions') THEN
    ALTER TABLE payout_history
      ADD CONSTRAINT fk_payout_tenant
      FOREIGN KEY (tenant_id) REFERENCES referral_codes(tenant_id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
