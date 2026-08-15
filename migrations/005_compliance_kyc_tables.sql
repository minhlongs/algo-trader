-- 004-compliance-kyc-tables: Compliance and KYC tables for regulatory requirements
-- Applied via: npx wrangler d1 execute algo-trader-db --remote --file=migrations/004_compliance_kyc_tables.sql

-- KYC Submissions (tracks individual verification requests)
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'persona',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'expired')),
  document_type TEXT NOT NULL
    CHECK (document_type IN ('passport', 'drivers_license', 'national_id', 'other')),
  review_result JSONB DEFAULT '{}',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  raw_response JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_submissions_tenant_id ON kyc_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_status ON kyc_submissions(status);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_created_at ON kyc_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_tenant_status ON kyc_submissions(tenant_id, status);

-- KYC Webhook Events (audit trail for provider callbacks)
CREATE TABLE IF NOT EXISTS kyc_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_webhook_events_provider ON kyc_webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_kyc_webhook_events_event_type ON kyc_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_kyc_webhook_events_created_at ON kyc_webhook_events(created_at DESC);

-- Compliance Audit Log (immutable record of compliance rule evaluations)
CREATE TABLE IF NOT EXISTS compliance_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('blocked', 'warned', 'passed', 'reviewed')),
  details JSONB NOT NULL DEFAULT '{}',
  blocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_tenant_id ON compliance_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_rule_id ON compliance_audit_log(rule_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_created_at ON compliance_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_log_action ON compliance_audit_log(action);

-- Compliance Transactions (flagged transactions for AML/regulatory review)
CREATE TABLE IF NOT EXISTS compliance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  trade_id TEXT NOT NULL,
  amount_usd NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  type TEXT NOT NULL
    CHECK (type IN ('deposit', 'withdrawal', 'trade', 'transfer')),
  source_exchange TEXT,
  destination TEXT,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  risk_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_transactions_tenant_id ON compliance_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_transactions_trade_id ON compliance_transactions(trade_id);
CREATE INDEX IF NOT EXISTS idx_compliance_transactions_flagged ON compliance_transactions(flagged);
CREATE INDEX IF NOT EXISTS idx_compliance_transactions_created_at ON compliance_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_transactions_risk_score ON compliance_transactions(risk_score DESC);
