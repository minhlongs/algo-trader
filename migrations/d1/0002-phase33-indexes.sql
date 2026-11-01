-- Phase 33: Performance Tuning — Composite indexes for hot-path queries

-- Subscription lookups during payment flow
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions(user_id, status);

-- Payment log scanning by invoice + recency
CREATE INDEX IF NOT EXISTS idx_payment_logs_created
  ON payment_logs(created_at);

-- Coupon validation and expiration checks
CREATE INDEX IF NOT EXISTS idx_coupons_tier_expires
  ON coupons(tier_lock, expires_at);
