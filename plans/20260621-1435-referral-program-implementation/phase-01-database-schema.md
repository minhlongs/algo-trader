# Phase 1: Database Schema & Core Models

**Priority**: P1  
**Status**: Not Started  
**Owner**: Backend Team  
**Estimated Effort**: 2 days  

---

## Context

This phase establishes the data foundation for the referral program. We need to store referral codes, track clicks and conversions, and calculate commissions.

**Referenced Files**:
- `src/db/schema.sql` (existing)
- `src/db/migrations/` (existing migration structure)
- `src/billing/db/billing-repository.ts` (for fee calculation patterns)

---

## Requirements

### Functional
1. Create `referral_codes` table (unique codes per tenant)
2. Create `referral_tracking` table (clicks, conversions)
3. Create `referral_commissions` table (commission records)
4. Add `referral_code` column to `tenant_credentials` (for tenant's own code)
5. Migration must preserve existing data
6. Backfill referral codes for existing tenants

### Non-Functional
- All tables indexed for query performance
- Foreign key constraints for data integrity
- Row-level security (tenant_id isolation)
- Migration idempotent (can be run multiple times safely)
- Database connection pooling configured (already in place)

---

## Architecture

### Table: referral_codes

```sql
CREATE TABLE IF NOT EXISTS referral_codes (
  code VARCHAR(32) PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER DEFAULT NULL, -- NULL = unlimited
  used_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tenant_id) -- one code per tenant
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_tenant_id ON referral_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
```

**Notes**:
- `code` is the actual referral code (e.g., "ALGO2025")
- `tenant_id` references the tenant (subscriber_id)
- `used_count` tracks how many times code has been used to signup

---

### Table: referral_tracking

```sql
CREATE TABLE IF NOT EXISTS referral_tracking (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  referral_code VARCHAR(32) NOT NULL,
  clicked_by_ip INET NOT NULL,
  clicked_by_user_agent TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  converted_tenant_id TEXT, -- NULL if not converted
  converted_user_id TEXT,
  revenue_generated DECIMAL(18, 8) DEFAULT 0,
  commission_calculated DECIMAL(18, 8) DEFAULT 0,
  fraud_score INTEGER DEFAULT 0 CHECK (fraud_score >= 0 AND fraud_score <= 100),
  is_fraudulent BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_referral_tracking_code ON referral_tracking(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_converted ON referral_tracking(converted_tenant_id) WHERE converted_tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_tracking_clicked_at ON referral_tracking(clicked_at);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_fraud ON referral_tracking(is_fraudulent) WHERE is_fraudulent = false;
```

**Notes**:
- Tracks each click on a referral link
- `converted_tenant_id` populated when referred tenant signs up and pays
- `revenue_generated` = total fees from that tenant
- `commission_calculated` = 10% of revenue
- `fraud_score` from fraud detector (0-100)
- `metadata` stores click context (campaign, landing page, etc.)

---

### Table: referral_commissions

```sql
CREATE TABLE IF NOT EXISTS referral_commissions (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  tenant_id TEXT NOT NULL, -- referring tenant
  tracking_id TEXT NOT NULL REFERENCES referral_tracking(id),
  commission_amount DECIMAL(18, 8) NOT NULL,
  fee_percentage DECIMAL(5, 4) NOT NULL DEFAULT 0.10,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'void')),
  paid_at TIMESTAMPTZ,
  stripe_payout_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_tenant_id ON referral_commissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions(status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_period ON referral_commissions(period_start, period_end);
```

**Notes**:
- Monthly aggregation of commissions per referring tenant
- `status`: pending (calculated), approved (reviewed), paid (transferred), void (reversed)
- Links to `referral_tracking` for audit trail
- `period_start`/`period_end` define the billing period

---

### Alter: tenant_credentials

```sql
ALTER TABLE tenant_credentials ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_tenant_credentials_referral_code ON tenant_credentials(referral_code) WHERE referral_code IS NOT NULL;
```

**Notes**:
- Stores the tenant's own referral code
- Nullable for backward compatibility
- Unique index enforces one code per tenant

---

## Implementation Steps

1. **Create migration file**: `src/db/migrations/103_create_referral_tables.ts`
2. **Write SQL migrations**: Up and down migrations
3. **Backfill script**: Generate referral codes for existing tenants
4. **Test migration** on staging database
5. **Update `schema.sql`** with new tables
6. **Create repository**: `src/referral/referral-repository.ts`
7. **Define TypeScript interfaces**: `src/referral/types.ts`
8. **Add indexes** for query performance
9. **Run typecheck**: `pnpm run typecheck`
10. **Run tests**: `pnpm test` (new tests to be added in Phase 7)

---

## File Ownership

**Backend (Exclusive)**:
- `src/db/migrations/103_create_referral_tables.ts`
- `src/db/migrations/103_backfill_referral_codes.ts` (optional separate)
- `src/db/schema.sql` (update with new tables)
- `src/referral/referral-repository.ts` (new)
- `src/referral/types.ts` (new)

**No overlap** with other parallel phases.

---

## Testing Strategy

### Unit Tests (Phase 7)
- Migration applies cleanly on test DB
- Migration is idempotent (can run twice without error)
- Backfill generates unique codes for all tenants
- Repository CRUD operations work correctly

### Integration Tests (Phase 7)
- Insert click → conversion → commission flow
- Foreign key constraints enforced
- Indexes used in queries (EXPLAIN ANALYZE)

### Staging Validation
- Run migration on staging copy
- Verify row counts match pre-migration
- Check no existing queries broken
- Performance: queries < 100ms with 10k rows

---

## Success Criteria

- [ ] Migration file created and reviewed
- [ ] Migration applies cleanly to staging DB (< 5 minutes)
- [ ] All new tables created with correct constraints
- [ ] Backfill completes for 100% of existing tenants
- [ ] No duplicate referral codes generated
- [ ] Repository basic CRUD tested
- [ ] Typecheck passes with 0 errors
- [ ] Schema.sql updated

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Migration locks tables | Run during off-peak, batch backfill |
| Duplicate referral codes | Use ULID + random suffix, enforce UNIQUE constraint |
| Existing data corruption | Full DB backup before migration, rollback plan |
| Performance degradation | Index all foreign keys, test with production data volume |

---

## Rollback Plan

If migration fails:

1. **Immediate**: Restore from backup (L1 rollback)
2. **Manual**: Run down migration to drop tables
3. **Re-run**: Fix issues, re-run migration

Down migration SQL:

```sql
DROP TABLE IF EXISTS referral_commissions;
DROP TABLE IF EXISTS referral_tracking;
DROP TABLE IF EXISTS referral_codes;
ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS referral_code;
```

---

## Next Steps

After Phase 1 completion:
1. Phase 2: Implement ReferralService
2. Use repository pattern from billing as template
3. Integrate with existing tenant auth middleware

---

**Phase Status**: Not Started  
**Blockers**: None  
**Dependencies**: None (foundational)
