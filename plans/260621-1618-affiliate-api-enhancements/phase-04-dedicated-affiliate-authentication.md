# Phase 4: Dedicated Affiliate Authentication

**Priority**: P1 - Security  
**Status**: Not Started  
**Effort**: 1.5 days  
**Dependencies**: Phase 3 (reporting) complete

---

## Context Links

- **Plan**: `plans/260621-1618-affiliate-api-enhancements/plan.md`
- **Existing API keys**: `src/billing/api-key-manager.ts`, `src/api/routes/api-key-routes.ts`
- **Auth middleware**: `src/api/middleware/tenant-auth-middleware.ts`
- **License system**: `src/billing/license-service.ts`

---

## Overview

Introduce a dedicated API key tier specifically for affiliate partners. Current system uses tenant API keys which grant access to all tenant endpoints. Affiliates only need access to referral data. Separate keys provide isolation, easier revocation, and allow partners to share keys with their own sub-affiliates without exposing full tenant credentials.

---

## Key Insights

- **Separation of concerns**: Affiliates should not have API keys that can access trades, PnL, or admin endpoints
- **Scope-limited**: Affiliate keys only work on `/api/v1/referral/*` and `/api/v1/referral/reports/*`
- **Higher rate limits**: Affiliates typically need higher quotas (1000 RPM) for reporting vs regular tenants (100 RPM)
- **Key rotation**: Affiliate keys can rotate independently of tenant's main API keys
- **Dashboard integration**: Tenants can generate/revoke affiliate keys from referral dashboard
- **Audit**: Track affiliate key usage separately for billing/abuse detection

---

## Requirements

### Functional

1. **New DB table** `affiliate_api_keys`:
   - `id` (UUID primary key)
   - `tenant_id` (owner of the affiliate program)
   - `key_hash` (HMAC-SHA256 of the actual key)
   - `key_prefix` (first 8 chars for display, e.g., `aff_abc123`)
   - `name` (partner label: "John's Blog")
   - `is_active` (boolean, default true)
   - `rate_limit_rpm` (default 1000)
   - `last_used_at` (timestamp)
   - `created_at`, `revoked_at`
   - `metadata` (JSONB: { partner_name, contact_email, website })

2. **API endpoints** (extend existing `api-key-routes.ts` or separate):
   - `POST /api/v1/affiliate/keys/generate` - create new affiliate key
   - `POST /api/v1/affiliate/keys/rotate/:id` - rotate specific key
   - `DELETE /api/v1/affiliate/keys/:id` - revoke key
   - `GET /api/v1/affiliate/keys` - list affiliate keys for tenant
   - `POST /api/v1/affiliate/keys/validate` - partners validate their key (returns tenant_id if valid)

3. **Middleware** `affiliateAuthMiddleware`:
   - Check `X-Affiliate-API-Key` header
   - Validate key hash matches DB record and is active
   - Set `req.affiliate = { tenantId, isAffiliate: true, keyId }`
   - Attach to `/api/v1/referral/*` and `/api/v1/referral/reports/*` routes

4. **Dashboard**: Affiliate key management section (separate from tenant API keys)
   - List keys with name, prefix, last used, status
   - Generate new key (with name input)
   - Rotate/revoke actions
   - Show usage metrics (requests per minute, last 24h)

5. **Auto-generation**: For existing tenants with >10 conversions, auto-generate 1 affiliate key on first referral page visit (opt-in)

### Non-Functional

- **Security**: Store only key hash (HMAC-SHA256 with server secret). Never log raw keys.
- **Rate limiting**: Separate bucket per affiliate key (1000 RPM default). Use Redis key pattern: `affiliate_rate:{key_prefix}`.
- **Revocation**: Immediate (soft delete with `revoked_at`). Takes effect in < 1 second.
- **Rotation**: New key generated, old key valid for 5-minute overlap, then auto-revoke.
- **Audit**: Log all affiliate key usage (tenant_id, key_id, endpoint, IP, user-agent) to `audit_logs` table.

---

## Architecture

### Data Model

```sql
CREATE TABLE affiliate_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenant_credentials(tenant_id),
  key_hash VARCHAR(64) NOT NULL UNIQUE,  -- HMAC-SHA256
  key_prefix VARCHAR(8) NOT NULL,        -- first 8 chars for display
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit_rpm INTEGER NOT NULL DEFAULT 1000,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  UNIQUE(tenant_id, name)  -- one name per tenant
);

CREATE INDEX idx_affiliate_keys_tenant ON affiliate_api_keys(tenant_id);
CREATE INDEX idx_affiliate_keys_hash ON affiliate_api_keys(key_hash);
CREATE INDEX idx_affiliate_keys_active ON affiliate_api_keys(is_active) WHERE is_active = true;
```

### Key Generation

```typescript
class AffiliateApiKeyManager {
  async generateKey(tenantId: string, name: string, options?: { rateLimitRpm?: number }): Promise<{ key: string; keyPrefix: string }> {
    const rawKey = this.generateSecureKey(); // 32 chars: aff_ + 24 random (URL-safe base64)
    const keyHash = this.hashKey(rawKey); // HMAC-SHA256 with SECRET
    const keyPrefix = rawKey.substring(0, 8);
    
    await db.query(
      `INSERT INTO affiliate_api_keys (tenant_id, key_hash, key_prefix, name, rate_limit_rpm) VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, keyHash, keyPrefix, name, options?.rateLimitRpm ?? 1000]
    );
    
    return { key: rawKey, keyPrefix };
  }
  
  async validateKey(key: string): Promise<{ tenantId: string; keyId: string } | null> {
    const keyHash = this.hashKey(key);
    const result = await db.query(
      `SELECT id, tenant_id FROM affiliate_api_keys WHERE key_hash = $1 AND is_active = true AND revoked_at IS NULL`,
      [keyHash]
    );
    if (result.rows.length === 0) return null;
    
    // Update last_used_at
    await db.query(`UPDATE affiliate_api_keys SET last_used_at = NOW() WHERE id = $1`, [result.rows[0].id]);
    
    return { tenantId: result.rows[0].tenant_id, keyId: result.rows[0].id };
  }
  
  private hashKey(key: string): string {
    return crypto.createHmac('sha256', process.env.AFFILIATE_KEY_SECRET!)
      .update(key)
      .digest('hex');
  }
  
  private generateSecureKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    let key = 'aff_';
    for (let i = 0; i < 24; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }
}
```

### Middleware

```typescript
export async function affiliateAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-affiliate-api-key'] as string | undefined;
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-Affiliate-API-Key header' });
  }
  
  const affiliateKeyManager = AffiliateApiKeyManager.getInstance();
  const validation = await affiliateKeyManager.validateKey(apiKey);
  
  if (!validation) {
    return res.status(401).json({ error: 'Invalid or revoked affiliate API key' });
  }
  
  // Attach to request
  (req as Request & { affiliate?: { tenantId: string; keyId: string; isAffiliate: boolean } }).affiliate = {
    tenantId: validation.tenantId,
    keyId: validation.keyId,
    isAffiliate: true,
  };
  
  next();
}
```

### Route Registration

```typescript
// In server.ts
import { affiliateAuthMiddleware } from './middleware/affiliate-auth';
import { affiliateKeysRouter } from './routes/affiliate-key-routes';

// Affiliate key management (tenant auth required)
this.app.use('/api/v1/affiliate/keys', tenantAuthMiddleware, affiliateKeysRouter);

// Affiliate referral endpoints (affiliate auth OR tenant auth)
this.app.use('/api/v1/referral', 
  compose(affiliateAuthMiddleware, tenantAuthMiddleware), // either works
  referralRouter
);
this.app.use('/api/v1/referral/reports',
  affiliateAuthMiddleware, // affiliate auth sufficient
  referralReportsRouter
);
```

---

## Related Code Files

**To Modify**:
- `src/api/server.ts` - register new affiliate routes and middleware
- `src/api/middleware/tenant-auth-middleware.ts` - ensure compatibility with dual auth

**To Create**:
- `src/billing/affiliate-api-key-manager.ts` - key generation/validation
- `src/api/middleware/affiliate-auth.ts` - auth middleware
- `src/api/routes/affiliate-key-routes.ts` - CRUD for affiliate keys
- `src/db/migrations/026_affiliate_api_keys.sql` - new table
- `dashboard/src/components/affiliate/affiliate-key-management.tsx` - UI for key management
- `dashboard/src/pages/affiliate-settings-page.tsx` (or extend existing referral page)
- Tests: `src/billing/__tests__/affiliate-api-key-manager.test.ts`, `src/api/routes/__tests__/affiliate-key-routes.test.ts`

---

## Implementation Steps

1. **Create migration** `026_affiliate_api_keys.sql` (see SQL above)

2. **Implement `AffiliateApiKeyManager`**:
   - Singleton pattern (like `ApiKeyManager`)
   - Methods: `generateKey()`, `validateKey()`, `revokeKey()`, `rotateKey()`, `listKeys(tenantId)`
   - Store `AFFILIATE_KEY_SECRET` in env

3. **Create `affiliate-auth` middleware**:
   - Read `X-Affiliate-API-Key` header
   - Call `AffiliateApiKeyManager.validateKey()`
   - Attach `req.affiliate`
   - Return 401 if invalid

4. **Create `affiliate-key-routes.ts`**:
   - `GET /` - list keys for tenant (from req.tenantId, tenant auth required)
   - `POST /generate` - `{ name: string }` → returns `{ key, keyPrefix, id }` (only time full key shown)
   - `POST /rotate/:id` - generate new key, revoke old (show new key once)
   - `DELETE /:id` - soft revoke (set `revoked_at = NOW()`)
   - All require `tenantAuthMiddleware`

5. **Update referral routes** to accept affiliate auth:
   - Add middleware `affiliateAuthMiddleware` to `/api/v1/referral/*` and `/api/v1/referral/reports/*`
   - Modify `extractTenantId()` to check `req.affiliate?.tenantId` as well as `req.tenantId`
   - Ensure affiliate can only access their own tenant's data (already enforced)

6. **Dashboard integration**:
   - Extend `referral-page.tsx` with "Affiliate API Keys" section
   - Show table: name, prefix, last used, status, actions (rotate, revoke)
   - "Generate New Key" button → modal with name input
   - Show key value once after generation (copy to clipboard)

7. **Auto-generation job** (optional):
   - In `ReferralService`, when tenant reaches 10 conversions for first time
   - Check if they have any affiliate keys; if not, auto-generate one with name "Auto-generated (Pilot)"
   - Send email notification: "Your affiliate program is ready! Access your API keys at..."

8. **Rate limiting**:
   - Update `distributed-rate-limiter` to recognize affiliate keys
   - Separate counter key: `rate:affiliate:{keyPrefix}` with 1000 RPM limit
   - Return `429 Too Many Requests` with `Retry-After` header

9. **Audit logging**:
   - In `affiliateAuthMiddleware`, log usage: `auditLogger.log('affiliate_key_used', { keyId, tenantId, endpoint, ip })`
   - Add to `src/audit/audit-action.ts` if exists

10. **Write tests**:
    - Unit: `AffiliateApiKeyManager.generateKey()`, `validateKey()`, hash consistency
    - Unit: `affiliateAuthMiddleware` with valid/invalid keys
    - Integration: Full flow: generate key → use key to access `/api/v1/referral/stats` → verify correct tenant data
    - Integration: Rate limiting: 1001 requests in 1 minute → 429 on 1001st
    - Security: Tenant A's affiliate key cannot access Tenant B's data

11. **Documentation**:
    - Update API docs: `X-Affiliate-API-Key` header usage
    - Write `docs/affiliate-program.md` for partners

12. **Deploy**:
    - Run migration
    - Test key generation UI
    - Test API access with generated key (curl)
    - Monitor audit logs for abuse

---

## Todo List

- [ ] Create migration `026_affiliate_api_keys.sql`
- [ ] Implement `AffiliateApiKeyManager` (singleton)
- [ ] Create `affiliate-auth` middleware
- [ ] Create `affiliate-key-routes.ts`
- [ ] Update referral routes to accept affiliate auth
- [ ] Modify `extractTenantId()` to check `req.affiliate`
- [ ] Register routes in `server.ts`
- [ ] Implement rate limiting for affiliate keys
- [ ] Add audit logging for affiliate key usage
- [ ] Dashboard: affiliate key management UI
- [ ] Optional: auto-generation on 10th conversion
- [ ] Write unit tests (≥ 90%)
- [ ] Write integration tests
- [ ] Run typecheck (0 errors)
- [ ] Deploy to staging
- [ ] Update API docs

---

## Success Criteria

- **Key generation**: Tenants can create/rotate/revoke affiliate keys from dashboard
- **Auth**: Affiliate keys work on all referral endpoints
- **Isolation**: Affiliate keys cannot access non-referral endpoints (trades, pnl, etc.)
- **Rate limiting**: 1000 RPM enforced per key
- **Security**: Key hashes stored; raw keys never logged; rotation/revocation immediate
- **Dashboard**: Key management UI intuitive; shows usage metrics
- **Tests**: Unit ≥90%, integration 100%

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Affiliate key leaked | Medium | High | Easy revocation UI; audit logs to detect abuse; encourage rotation every 90 days |
| Rate limit too low for power partners | Low | Medium | Make configurable per-key (default 1000); allow tenant admin to increase |
| Key rotation breaks partner integration | Medium | Medium | 5-minute overlap period; email notification to partners before revoke |
| Affiliate key used to access non-referral endpoints | Low | High | Middleware order: affiliate auth only on referral routes; test auth bypass attempts |

---

## Security Considerations

- **Hash storage**: HMAC-SHA256 with server secret; one-way; DB breach doesn't expose raw keys
- **Logging**: Never log raw `X-Affiliate-API-Key`; log only `keyId` (UUID)
- **Revocation**: Soft delete with `revoked_at`; immediate effect (no grace period)
- **Scope enforcement**: Middleware only attached to referral routes; tenant auth still required for key management
- **Rate limiting**: Separate per-key; prevents DoS from compromised key
- **Audit trail**: All key usage, generation, rotation logged to `audit_logs` with IP, user-agent

---

## Next Steps

After Phase 4:
1. Phase 5: Enhanced fraud detection (improves data quality, reduces false positives)
2. Phase 6: Testing & monitoring (load test, metrics, Grafana dashboard)
3. Documentation and partner onboarding materials

---

**Phase Status**: Not Started  
**Blockers**: Phase 3 completion (reporting API)  
**Next**: Begin implementation after Phase 3 tests pass
