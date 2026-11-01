-- 0001-subscriptions: D1 schema for billing + IPN logging
-- Applied via: npx wrangler d1 execute algo-trader-db --remote --file=migrations/0001-subscriptions.sql

-- Subscriptions (per-user)
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('FREE','STARTER','PRO','ENTERPRISE','MASTER')),
  status TEXT NOT NULL CHECK(status IN ('active','canceled','expired')),
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  nowpayments_invoice_id TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON subscriptions(tier);

-- Coupons
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  discount_pct INTEGER NOT NULL DEFAULT 0,
  tier_lock TEXT,
  free_access INTEGER DEFAULT 0,
  expires_at TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- NOWPayments IPN audit log
CREATE TABLE IF NOT EXISTS payment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id TEXT NOT NULL,
  payment_id TEXT,
  amount REAL,
  currency TEXT,
  status TEXT NOT NULL,
  raw_payload TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_logs_invoice_status ON payment_logs(invoice_id, status);
