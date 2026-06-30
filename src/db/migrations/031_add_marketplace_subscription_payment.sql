-- Migration 031: Add payment tracking to marketplace_subscriptions
-- Enables NOWPayments checkout flow for strategy subscriptions

ALTER TABLE marketplace_subscriptions
  ADD COLUMN IF NOT EXISTS payment_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded', 'expired'));

CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_payment_id
  ON marketplace_subscriptions(payment_id) WHERE payment_id IS NOT NULL;
