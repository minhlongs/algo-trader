/**
 * Migration Down Handlers — Rollback logic for SQL migrations.
 */

export interface MigrationClient {
  query: (sql: string) => Promise<unknown>;
}

export async function executeMigrationDown(client: MigrationClient, id: string): Promise<void> {
  if (id === '004_better_auth_tables') {
    await client.query('DROP TABLE IF EXISTS verification CASCADE');
    await client.query('DROP TABLE IF EXISTS account CASCADE');
    await client.query('DROP TABLE IF EXISTS session CASCADE');
    await client.query('DROP TABLE IF EXISTS "user" CASCADE');
  } else if (id === '005_compliance_kyc_tables') {
    await client.query('DROP TABLE IF EXISTS compliance_transactions CASCADE');
    await client.query('DROP TABLE IF EXISTS kyc_submissions CASCADE');
  } else if (id === '014_signal_feed') {
    await client.query('DROP TABLE IF EXISTS signal_delivery_log CASCADE');
    await client.query('DROP TABLE IF EXISTS signal_subscriptions CASCADE');
    await client.query('DROP TABLE IF EXISTS signals CASCADE');
  } else if (id === '015_subscriber_attribution') {
    await client.query('DROP TABLE IF EXISTS subscriber_equity_snapshots CASCADE');
    try {
      await client.query('ALTER TABLE trades DROP COLUMN IF EXISTS subscriber_id');
      await client.query('ALTER TABLE trades DROP COLUMN IF EXISTS attestation_id');
      await client.query('ALTER TABLE signals DROP COLUMN IF EXISTS subscriber_id');
    } catch {}
  } else if (id === '016_qwen_paper_tracking') {
    await client.query('DROP TABLE IF EXISTS paper_trades_v3 CASCADE');
    try {
      await client.query('ALTER TABLE signals DROP COLUMN IF EXISTS source');
      await client.query('ALTER TABLE signals DROP COLUMN IF EXISTS paper_only');
    } catch {}
  } else if (id === '017_strategy_review_tasks') {
    await client.query('DROP TABLE IF EXISTS strategy_review_tasks CASCADE');
  } else if (id === '018_qwen_signals_loop_runs') {
    await client.query('DROP TABLE IF EXISTS qwen_signals_loop_runs CASCADE');
  } else if (id === '021_create_tenant_audit_logs') {
    await client.query('DROP TABLE IF EXISTS tenant_audit_logs CASCADE');
  } else if (id === '021_tenant_credentials') {
    await client.query('DROP TABLE IF EXISTS tenant_credentials CASCADE');
  } else if (id === '042_add_encrypted_credential_columns') {
    await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS api_key_encrypted');
    await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS api_secret_encrypted');
    await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS passphrase_encrypted');
    await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS private_key_encrypted');
    await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS public_key');
    await client.query('DROP INDEX IF EXISTS idx_tenant_credentials_api_key_encrypted');
    await client.query('DROP INDEX IF EXISTS idx_tenant_credentials_api_secret_encrypted');
  } else if (id === '0002-phase33-indexes') {
    await client.query('DROP INDEX IF EXISTS idx_payment_logs_created');
    await client.query('DROP INDEX IF EXISTS idx_orders_user_created');
    await client.query('DROP INDEX IF EXISTS idx_coupons_redeemed');
  } else if (id === '048-prediction-history') {
    await client.query('DROP TABLE IF EXISTS prediction_history CASCADE');
  }
}
