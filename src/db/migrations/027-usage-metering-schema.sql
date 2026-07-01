-- Usage Metering & Billing Schema
-- Tracks API usage per license for billing and quota management

-- Table: license_usage_daily
-- Daily aggregated usage per license key
CREATE TABLE IF NOT EXISTS license_usage_daily (
  id SERIAL PRIMARY KEY,
  license_key VARCHAR(64) NOT NULL,
  date DATE NOT NULL GENERATED ALWAYS AS (CURRENT_DATE) STORED,
  tier VARCHAR(16) NOT NULL,
  api_calls_count INTEGER NOT NULL DEFAULT 0,
  overage_units INTEGER NOT NULL DEFAULT 0,
  overage_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(license_key, date)
);

CREATE INDEX IF NOT EXISTS idx_license_usage_daily_license_key ON license_usage_daily(license_key);
CREATE INDEX IF NOT EXISTS idx_license_usage_daily_date ON license_usage_daily(date);
CREATE INDEX IF NOT EXISTS idx_license_usage_daily_tier ON license_usage_daily(tier);

-- Table: usage_events
-- Detailed event log for each API call (for analytics and debugging)
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key VARCHAR(64) NOT NULL,
  tenant_id TEXT,
  endpoint VARCHAR(128) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_license_key ON usage_events(license_key);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_id ON usage_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_endpoint ON usage_events(endpoint);

-- Table: overage_invoices
-- Tracks billing for usage beyond tier limits
CREATE TABLE IF NOT EXISTS overage_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key VARCHAR(64) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  overage_units INTEGER NOT NULL,
  rate_per_unit DECIMAL(10, 4) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'void')),
  stripe_invoice_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overage_invoices_license_key ON overage_invoices(license_key);
CREATE INDEX IF NOT EXISTS idx_overage_invoices_period ON overage_invoices(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_overage_invoices_status ON overage_invoices(status);

-- Function: update_updated_at_column()
-- Auto-update updated_at on row modifications
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_license_usage_updated_at ON license_usage_daily;
CREATE TRIGGER update_license_usage_updated_at
  BEFORE UPDATE ON license_usage_daily
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_overage_invoices_updated_at ON overage_invoices;
CREATE TRIGGER update_overage_invoices_updated_at
  BEFORE UPDATE ON overage_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
