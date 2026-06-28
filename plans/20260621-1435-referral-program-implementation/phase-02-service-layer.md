# Phase 2: Referral Service Layer

**Priority**: P1  
**Status**: Not Started  
**Owner**: Backend Team  
**Estimated Effort**: 3 days  

---

## Context

Build the core business logic for the referral program. This service handles code generation, commission calculation, click tracking, and fraud detection.

**Referenced Files**:
- `src/billing/compute-metering.ts` (fee calculation pattern)
- `src/billing/subscription-service.ts` (subscription lifecycle)
- `src/features/feature-flags.ts` (feature flag integration)

---

## Requirements

### Functional
1. Generate unique referral codes (8-char alphanumeric)
2. Validate referral codes on signup
3. Track clicks (IP, user agent, timestamp)
4. Track conversions (when referred tenant becomes paying)
5. Calculate commissions (10% of fees for 12 months)
6. Detect fraud (rate limits, IP patterns, suspicious behavior)
7. Support referral link generation with UTM parameters

### Non-Functional
- Stateless service (no in-memory state)
- Thread-safe operations
- Comprehensive error handling
- Full TypeScript typing (no `any`)
- 100ms response time for code generation
- Support 1000+ QPS for click tracking

---

## Architecture

### Core Services

#### `ReferralService` (main entry point)

```typescript
export class ReferralService {
  // Generate referral code for tenant
  async generateCode(tenantId: string): Promise<string>;
  
  // Get tenant's referral code
  async getReferralCode(tenantId: string): Promise<string | null>;
  
  // Track click on referral link
  async trackClick(
    code: string,
    ip: string,
    userAgent: string,
    metadata?: ReferralClickMetadata
  ): Promise<void>;
  
  // Mark conversion (referred tenant signed up)
  async markConversion(
    code: string,
    convertedTenantId: string,
    convertedUserId: string
  ): Promise<void>;
  
  // Get referral stats for tenant
  async getStats(tenantId: string): Promise<ReferralStats>;
  
  // Get commission history
  async getCommissions(tenantId: string): Promise<CommissionRecord[]>;
  
  // Fraud detection integration
  async assessClickRisk(clickData: ReferralClick): Promise<number>;
}
```

#### `CommissionCalculator`

```typescript
export interface FeeRecord {
  tenantId: string;
  period: Date;
  feeAmount: number;
  currency: string;
}

export class CommissionCalculator {
  // Calculate commission for a given period (default: monthly)
  calculate(
    referringTenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CommissionRecord>;
  
  // Calculate lifetime commissions
  async calculateLifetime(referringTenantId: string): Promise<number>;
  
  // Apply 10% rate, 12-month limit from conversion date
  private applyRate(
    feeRecords: FeeRecord[],
    conversionDate: Date
  ): number;
}
```

**Business Rules**:
- Commission rate: 10% of all fees paid by referred tenant
- Commission period: 12 months from first payment
- After 12 months: no more commissions
- Commissions calculated monthly, paid next month
- Prorated for partial months

---

#### `FraudDetector`

```typescript
export interface FraudDetectionResult {
  score: number; // 0-100
  reasons: string[];
  isBlocked: boolean;
}

export class FraudDetector {
  // Assess risk of a click
  assess(
    ip: string,
    userAgent: string,
    code: string,
    timestamp: Date
  ): FraudDetectionResult;
  
  // Check rate limits: max 10 clicks/hour per IP
  private checkRateLimit(ip: string): boolean;
  
  // Detect same-IP conversions (self-referral)
  private checkSelfReferral(ip: string, code: string): boolean;
  
  // Detect rapid-fire clicks (bot behavior)
  private checkClickPattern(ip: string, windowMs: number): boolean;
  
  // Check VPN/proxy (optional integration with third-party API)
  private async checkIPReputation(ip: string): Promise<boolean>;
  
  // Update fraud score in tracking record
  async updateFraudScore(trackingId: string, score: number): Promise<void>;
}
```

**Fraud Triggers**:
- >10 clicks/hour from same IP → score +30
- Same IP used for conversion and click → score +50 (self-referral)
- <100ms between clicks from same IP → score +40 (bot)
- Known proxy/VPN IP → score +20
- Score ≥ 80 → auto-block conversion

---

#### `PayoutScheduler` (integration with Phase 5)

```typescript
export class PayoutScheduler {
  // Monthly job: aggregate commissions and create payouts
  async runMonthlyPayouts(): Promise<PayoutResult>;
  
  // Get tenants with pending commissions ≥ minimum threshold ($10)
  async getEligibleTenants(startDate: Date, endDate: Date): Promise<string[]>;
  
  // Aggregate commissions for tenant
  async aggregateCommissions(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<number>;
  
  // Mark commissions as paid after Stripe transfer
  async markPaid(
    commissionIds: string[],
    stripePayoutId: string
  ): Promise<void>;
}
```

---

### Data Models

```typescript
// types.ts
export interface ReferralCode {
  code: string;
  tenantId: string;
  createdAt: Date;
  isActive: boolean;
  maxUses: number | null;
  usedCount: number;
}

export interface ReferralClick {
  id: string;
  code: string;
  clickedByIp: string;
  clickedByUserAgent: string;
  clickedAt: Date;
  convertedAt: Date | null;
  convertedTenantId: string | null;
  convertedUserId: string | null;
  revenueGenerated: number;
  commissionCalculated: number;
  fraudScore: number;
  isFraudulent: boolean;
  metadata: Record<string, unknown>;
}

export interface ReferralStats {
  totalClicks: number;
  uniqueClicks: number; // deduped by IP (24h window)
  conversions: number;
  conversionRate: number; // conversions / clicks
  totalRevenue: number; // from referred tenants
  totalCommissions: number; // earned
  pendingCommissions: number;
  paidCommissions: number;
  topReferrers: TopReferrer[];
}

export interface TopReferrer {
  tenantId: string;
  conversions: number;
  commissionEarned: number;
}

export interface CommissionRecord {
  id: string;
  tenantId: string;
  trackingId: string;
  commissionAmount: number;
  feePercentage: number;
  periodStart: Date;
  periodEnd: Date;
  status: 'pending' | 'approved' | 'paid' | 'void';
  paidAt: Date | null;
  stripePayoutId: string | null;
  createdAt: Date;
}

export interface ReferralClickMetadata {
  campaign?: string;
  landingPage?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  browser?: string;
}
```

---

## Implementation Steps

1. **Create directory**: `src/referral/`
2. **Define types**: `src/referral/types.ts`
3. **Create repository**: `src/referral/referral-repository.ts`
   - CRUD operations for all tables
   - Query methods: `getByTenantId()`, `getByCode()`, `getClicksByTenant()`, etc.
4. **Implement ReferralService**: `src/referral/referral-service.ts`
   - Core business logic
   - Error handling with custom errors
   - Transaction management for multi-step operations
5. **Implement CommissionCalculator**: `src/referral/commission-calculator.ts`
   - Fee aggregation from billing system
   - 12-month window enforcement
   - Currency handling (assume USD)
6. **Implement FraudDetector**: `src/referral/fraud-detector.ts`
   - In-memory rate limiter (Redis-backed for distributed)
   - IP pattern detection
   - Integration with existing rate limiting middleware
7. **Implement PayoutScheduler**: `src/referral/payout-scheduler.ts` (Phase 5 integration)
   - Monthly cron job orchestration
   - Stripe payout integration
8. **Error classes**: `src/referral/errors.ts`
   - `ReferralCodeNotFoundError`
   - `ReferralCodeExpiredError`
   - `CommissionCalculationError`
   - `FraudDetectedError`
9. **Feature flag checks**: Integrate with `src/features/feature-flags.ts`
10. **Logging**: Use existing `logger` from `src/utils/logger`
11. **Metrics**: Increment Prometheus counters
12. **Unit tests skeleton**: `src/referral/__tests__/` (Phase 7 fills in)

---

## Testing Strategy (Phase 7)

### Unit Tests
- `ReferralService.generateCode()` returns 8-char uppercase alphanumeric
- `ReferralService.getReferralCode()` returns null if not set
- `CommissionCalculator.calculate()` applies 10% rate correctly
- `FraudDetector.assessClickRisk()` returns ≥80 for self-referral
- `PayoutScheduler.getEligibleTenants()` filters by $10 threshold

### Integration Tests
- Click → conversion → commission flow
- Multiple clicks from same IP tracked correctly
- Commission stops after 12 months
- Payout job creates correct Stripe transfer amount

---

## Performance Considerations

- **Click tracking**: High-volume endpoint (1000+ QPS). Use connection pooling, batch inserts.
- **Redis cache**: Cache referral code lookups (TTL: 1 hour)
- **Database**: Indexes on `referral_tracking(code)`, `referral_commissions(tenant_id, status)`
- **Rate limiting**: Distributed rate limiter (existing middleware) per IP

---

## Success Criteria

- [ ] `ReferralService` fully implemented with 8 public methods
- [ ] `CommissionCalculator` handles 12-month window correctly
- [ ] `FraudDetector` blocks self-referral with score ≥80
- [ ] `PayoutScheduler` aggregates commissions accurately
- [ ] All methods have try-catch with structured errors
- [ ] No `any` types in codebase
- [ ] Typecheck passes: `pnpm run typecheck`
- [ ] Linting: `pnpm run lint` (≤100 warnings)

---

## Dependencies

- Phase 1: Database schema complete
- Existing: `src/utils/logger`, `src/utils/metrics`
- Existing: Redis client for rate limiting

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Commission miscalculation | High | Double-entry pattern: store raw fees + calculated commission, add reconciliation query |
| Fraud false positives | Medium | Manual review queue for score 70-85, admin override |
| Rate limiter distributed state | High | Use Redis backed rate limiter (existing `distributedRateLimiter`) |
| Performance under load | Medium | Batch click inserts (10ms window), connection pool tuning |

---

## File Ownership

**Exclusive to this phase**:
- `src/referral/types.ts`
- `src/referral/referral-repository.ts`
- `src/referral/referral-service.ts`
- `src/referral/commission-calculator.ts`
- `src/referral/fraud-detector.ts`
- `src/referral/payout-scheduler.ts`
- `src/referral/errors.ts`

**No overlap** with other phases.

---

## Next Steps

After Phase 2:
1. Phase 3: Expose services via REST API
2. Phase 4: Build dashboard UI
3. Phase 5: Implement payout automation (PayoutScheduler)

---

**Phase Status**: Not Started  
**Blockers**: Phase 1 completion  
**Dependencies**: None after Phase 1
