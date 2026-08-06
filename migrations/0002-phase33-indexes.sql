-- Phase 33: Performance Tuning — Composite indexes for hot-path queries

-- Subscription lookups during payment flow
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions(user_id, status);

-- Payment log scanning by invoice + recency
CREATE INDEX IF NOT EXISTS idx_payment_logs_created
  ON payment_logs(created_at);

-- Order history sorted by user + time
CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON orders(user_id, created_at);

-- Coupon redemption status checks
CREATE INDEX IF NOT EXISTS idx_coupons_redeemed
  ON coupons(redeemed, redeemed_at);
