# Phase 1: Database Schema & Core Models

**Status**: Not Started  
**Priority**: Critical  
**Parallel**: Can run concurrently with Phase 8 (frontend)  
**File Ownership**: `src/marketplace/schema/`, `src/marketplace/models/`, `src/db/migrations/`

---

## Context

This phase establishes the database schema for the strategy marketplace. All subsequent phases depend on these tables. We follow the existing migration pattern used in `src/db/migrations/`.

---

## Requirements

- Create 7 core tables for marketplace functionality
- Use PostgreSQL with proper indexes and constraints
- Follow existing migration file format (TypeScript-based migrations)
- Ensure tenant isolation via `tenantId` on all business tables
- Add composite indexes for query performance
- Support referential integrity with foreign keys

---

## Architecture

### Database Tables

1. **marketplace_strategies** - Strategy metadata and status
2. **marketplace_listings** - Active marketplace listings with pricing
3. **marketplace_subscriptions** - User subscriptions to strategies
4. **marketplace_performance** - Daily performance snapshots
5. **marketplace_reviews** - User reviews and ratings
6. **marketplace_revenue_shares** - Revenue distribution tracking
7. **marketplace_disputes** - Dispute resolution workflow

---

## Related Code Files

### To Create
- `src/marketplace/schema/marketplace-schema.sql` - Raw SQL schema
- `src/marketplace/models/strategy.model.ts` - TypeScript interfaces
- `src/marketplace/models/listing.model.ts`
- `src/marketplace/models/subscription.model.ts`
- `src/marketplace/models/performance.model.ts`
- `src/marketplace/models/review.model.ts`
- `src/marketplace/models/revenue-share.model.ts`
- `src/marketplace/models/dispute.model.ts`
- `src/db/migrations/025_create_marketplace_schema.ts`

### To Read (Reference)
- `src/db/migrations/024_create_referral_tables.sql` - Existing migration pattern
- `src/db/schema.sql` - Existing table definitions
- `src/db/migration-runner.ts` - Migration execution mechanism

---

## Implementation Steps

### Step 1: Define TypeScript Interfaces

Create model files with Zod validation schemas and TypeScript interfaces:

- `IStrategy` - id, tenantId, name, description, category, status, creatorId
- `IListing` - id, strategyId, price, billingCycle, riskLimits, isActive
- `ISubscription` - id, tenantId, listingId, status, allocationPercent, riskParams
- `IPerformance` - strategyId, date, sharpeRatio, maxDrawdown, totalPnl, winRate
- `IReview` - id, tenantId, strategyId, rating, comment, isVerified
- `IRevenueShare` - id, strategyId, tenantId, period, grossRevenue, creatorShare, platformShare
- `IDispute` - id, tenantId, listingId, reason, status, resolution, adminNotes

### Step 2: Write Migration File

Create `src/db/migrations/025_create_marketplace_schema.ts`:

```typescript
import { Migration } from '../migration-runner';

export const migration: Migration = {
  up: async (db) => {
    await db.exec(`
      -- marketplace_strategies table
      CREATE TABLE IF NOT EXISTS marketplace_strategies (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        creator_id TEXT NOT NULL, -- user who created the strategy
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(64) NOT NULL, -- arbitrage, momentum, mean-reversion, etc.
        status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_vetting', 'approved', 'rejected', 'suspended')),
        risk_level INTEGER NOT NULL CHECK (risk_level >= 1 AND risk_level <= 10),
        min_allocation_usd INTEGER NOT NULL DEFAULT 100,
        max_allocation_usd INTEGER NOT NULL DEFAULT 100000,
        supported_exchanges TEXT[], -- array of exchange names
        tags TEXT[], -- strategy tags for filtering
        backtest_summary JSONB, -- { sharpe: number, max_drawdown: number, win_rate: number, period_days: number }
        vetted_at TIMESTAMPTZ,
        vetted_by TEXT, -- admin user id
        rejection_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_marketplace_strategies_tenant_id ON marketplace_strategies(tenant_id);
      CREATE INDEX idx_marketplace_strategies_status ON marketplace_strategies(status);
      CREATE INDEX idx_marketplace_strategies_category ON marketplace_strategies(category);
      CREATE INDEX idx_marketplace_strategies_creator_id ON marketplace_strategies(creator_id);

      -- marketplace_listings table
      CREATE TABLE IF NOT EXISTS marketplace_listings (
        id VARCHAR(64) PRIMARY KEY,
        strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL, -- redundant for query performance
        price_usd_monthly INTEGER NOT NULL,
        billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
        risk_limits JSONB NOT NULL DEFAULT '{
          "max_daily_loss_percent": 5.0,
          "max_position_size_percent": 10.0,
          "stop_loss_percent": 2.0,
          "max_concurrent_trades": 5
        }',
        allowed_tenants TEXT[], -- empty = all tenants allowed, populated = whitelist
        excluded_tenants TEXT[], -- blacklist
        is_active BOOLEAN NOT NULL DEFAULT true,
        subscriber_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_marketplace_listings_strategy_id ON marketplace_listings(strategy_id);
      CREATE INDEX idx_marketplace_listings_tenant_id ON marketplace_listings(tenant_id);
      CREATE INDEX idx_marketplace_listings_active ON marketplace_listings(is_active) WHERE is_active = true;

      -- marketplace_subscriptions table
      CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        listing_id VARCHAR(64) NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
        strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
        status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'suspended')),
        allocation_percent DECIMAL(5,2) NOT NULL CHECK (allocation_percent > 0 AND allocation_percent <= 100),
        custom_risk_limits JSONB, -- overrides listing defaults
        current_investment_usd INTEGER NOT NULL DEFAULT 0,
        total_pnl_usd INTEGER DEFAULT 0,
        subscription_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paused_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, listing_id)
      );

      CREATE INDEX idx_marketplace_subscriptions_tenant_id ON marketplace_subscriptions(tenant_id);
      CREATE INDEX idx_marketplace_subscriptions_strategy_id ON marketplace_subscriptions(strategy_id);
      CREATE INDEX idx_marketplace_subscriptions_status ON marketplace_subscriptions(status);
      CREATE INDEX idx_marketplace_subscriptions_active ON marketplace_subscriptions(tenant_id, status) WHERE status = 'active';

      -- marketplace_performance table
      CREATE TABLE IF NOT EXISTS marketplace_performance (
        id SERIAL PRIMARY KEY,
        strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
        tenant_id TEXT, -- NULL = aggregate across all tenants (published strategy), specific = subscriber-specific
        date DATE NOT NULL,
        sharpe_ratio DECIMAL(8,4),
        max_drawdown DECIMAL(8,4),
        total_pnl_usd INTEGER NOT NULL DEFAULT 0,
        win_rate DECIMAL(5,2),
        total_trades INTEGER NOT NULL DEFAULT 0,
        winning_trades INTEGER NOT NULL DEFAULT 0,
        losing_trades INTEGER NOT NULL DEFAULT 0,
        avg_win_usd INTEGER,
        avg_loss_usd INTEGER,
        profit_factor DECIMAL(8,4),
        volatility DECIMAL(8,4),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(strategy_id, tenant_id, date)
      );

      CREATE INDEX idx_marketplace_performance_strategy_id ON marketplace_performance(strategy_id);
      CREATE INDEX idx_marketplace_performance_date ON marketplace_performance(date DESC);
      CREATE INDEX idx_marketplace_performance_tenant ON marketplace_performance(tenant_id) WHERE tenant_id IS NOT NULL;

      -- marketplace_reviews table
      CREATE TABLE IF NOT EXISTS marketplace_reviews (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
        subscription_id VARCHAR(64) NOT NULL REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        is_verified BOOLEAN NOT NULL DEFAULT true, -- verified subscription required
        helpful_votes INTEGER NOT NULL DEFAULT 0,
        reported_count INTEGER NOT NULL DEFAULT 0,
        is_flagged BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, strategy_id),
        UNIQUE(subscription_id)
      );

      CREATE INDEX idx_marketplace_reviews_strategy_id ON marketplace_reviews(strategy_id);
      CREATE INDEX idx_marketplace_reviews_tenant_id ON marketplace_reviews(tenant_id);
      CREATE INDEX idx_marketplace_reviews_rating ON marketplace_reviews(strategy_id, rating);

      -- marketplace_revenue_shares table
      CREATE TABLE IF NOT EXISTS marketplace_revenue_shares (
        id VARCHAR(64) PRIMARY KEY,
        strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL, -- subscriber tenant
        subscription_id VARCHAR(64) NOT NULL REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        gross_revenue_cents INTEGER NOT NULL, -- total subscription revenue in cents
        platform_share_cents INTEGER NOT NULL, -- 80%
        creator_share_cents INTEGER NOT NULL, -- 20%
        status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'void')),
        paid_at TIMESTAMPTZ,
        stripe_payout_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(strategy_id, tenant_id, period_start, period_end)
      );

      CREATE INDEX idx_marketplace_revenue_shares_strategy_id ON marketplace_revenue_shares(strategy_id);
      CREATE INDEX idx_marketplace_revenue_shares_tenant_id ON marketplace_revenue_shares(tenant_id);
      CREATE INDEX idx_marketplace_revenue_shares_period ON marketplace_revenue_shares(period_start, period_end);
      CREATE INDEX idx_marketplace_revenue_shares_status ON marketplace_revenue_shares(status);

      -- marketplace_disputes table
      CREATE TABLE IF NOT EXISTS marketplace_disputes (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id TEXT NOT NULL, -- dispute filer
        listing_id VARCHAR(64) NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
        subscription_id VARCHAR(64) NOT NULL REFERENCES marketplace_subscriptions(id) ON DELETE CASCADE,
        reason VARCHAR(64) NOT NULL CHECK (reason IN ('performance_not_as_described', 'unauthorized_charges', 'poor_support', 'strategy_broken', 'other')),
        description TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved_creator', 'resolved_subscriber', 'escalated', 'closed')),
        resolution TEXT,
        resolved_by TEXT, -- admin user id
        resolved_at TIMESTAMPTZ,
        compensation_amount_cents INTEGER, -- refund amount if any
        compensation_type VARCHAR(32), -- 'full_refund', 'partial_refund', 'credit', 'none'
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_marketplace_disputes_tenant_id ON marketplace_disputes(tenant_id);
      CREATE INDEX idx_marketplace_disputes_listing_id ON marketplace_disputes(listing_id);
      CREATE INDEX idx_marketplace_disputes_status ON marketplace_disputes(status);
      CREATE INDEX idx_marketplace_disputes_created ON marketplace_disputes(created_at DESC);
    `);
  },

  down: async (db) => {
    await db.exec(`
      DROP TABLE IF EXISTS marketplace_disputes CASCADE;
      DROP TABLE IF EXISTS marketplace_revenue_shares CASCADE;
      DROP TABLE IF EXISTS marketplace_reviews CASCADE;
      DROP TABLE IF EXISTS marketplace_performance CASCADE;
      DROP TABLE IF EXISTS marketplace_subscriptions CASCADE;
      DROP TABLE IF EXISTS marketplace_listings CASCADE;
      DROP TABLE IF EXISTS marketplace_strategies CASCADE;
    `);
  }
};

export default migration;

```

---

## Todo List

- [ ] Research existing strategy model in `src/strategies/types.ts` to align marketplace strategy representation
- [ ] Review `src/db/migrations/024_create_referral_tables.sql` for migration patterns
- [ ] Create `src/marketplace/schema/marketplace-schema.sql` with raw SQL
- [ ] Create `src/marketplace/models/strategy.model.ts` with Zod schema
- [ ] Create all model files (listing, subscription, performance, review, revenue-share, dispute)
- [ ] Write migration file `025_create_marketplace_schema.ts`
- [ ] Test migration locally with `pnpm exec ts-node src/db/migration-runner.ts`
- [ ] Verify table creation with `psql` queries
- [ ] Add indexes for all common query patterns

---

## Success Criteria

- ✅ All 7 tables created with proper foreign keys
- ✅ Indexes on tenant_id, strategy_id, status, date fields
- ✅ Check constraints for enums and numeric ranges
- ✅ Unique constraints prevent duplicate subscriptions/reviews
- ✅ Migration file follows existing pattern and executes without errors
- ✅ TypeScript interfaces match database schema exactly

---

## Risks & Mitigations

**Risk**: Migration conflicts with existing tables  
**Mitigation**: Use `IF NOT EXISTS` checks, test on staging first

**Risk**: Missing indexes cause slow queries  
**Mitigation**: Add composite indexes for common query patterns (strategy + status, tenant + active, etc.)

**Risk**: Tenant isolation not enforced  
**Mitigation**: Ensure all queries filter by tenant_id; add Row Level Security (RLS) policies if needed

---

## Next Steps

After this phase completes:
- Phase 2 (API Routes) can start immediately using these models
- Phase 8 (Frontend) can begin with mock data while waiting for API
