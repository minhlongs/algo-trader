# Phase 8: Security Hardening

**Priority:** Critical - Production security baseline  
**Status:** Pending  
**Setup Duration:** 1-2 hours pre-deployment

---

## Context Links

- Main Plan: `plan.md`
- Related: [Security Controls](../docs/security-controls.md)
- Related: [SOC2 Compliance](../docs/soc2-compliance.md)
- Scripts: `scripts/test-api-security.sh`, `scripts/scan-for-secrets.sh`

---

## Overview

Implement comprehensive security controls including API authentication, rate limiting, CORS, TLS, audit logging, and secrets management. Validate all security mechanisms before production deployment.

---

## Requirements

### Functional Requirements
1. API key authentication for all endpoints
2. Rate limiting (per API key, per IP)
3. JWT token management with expiration
4. CORS whitelist configured
5. Cloudflare header verification
6. Secrets stored in DO secret manager (not code)
7. Audit logging for admin operations
8. SOC2 controls documented and validated

### Non-Functional Requirements
- No hardcoded secrets in codebase
- Zero unencrypted sensitive data at rest
- TLS 1.3 for all external connections
- API key rotation enforced (90-day expiry)
- All authentication events logged
- Fail-secure default (deny by default)

---

## Architecture

```
Security Layers

┌────────────────────────────────────────┐
│      External Traffic (Cloudflare)      │
│  ├ DDoS Protection                     │
│  ├ WAF Rules                          │
│  ├ Header Verification (CF-Worker)    │
│  └ Rate Limiting (Edge)               │
└────────────────┬───────────────────────┘
                 │
┌────────────────▼───────────────────────┐
│         API Gateway (Fastify)           │
│  ├ API Key Validation                  │
│  ├ JWT Token Validation                │
│  ├ CORS Whitelist                      │
│  ├ Request Size Limits                 │
│  ├ Rate Limiting (Redis)               │
│  └ Audit Logging                       │
└────────────────┬───────────────────────┘
                 │
┌────────────────▼───────────────────────┐
│           Application Layer             │
│  ├ Authorization (tenant isolation)   │
│  ├ Input Validation                    │
│  ├ Output Sanitization                 │
│  └ Error Handling (no data leak)      │
└────────────────┬───────────────────────┘
                 │
┌────────────────▼───────────────────────┐
│          Data Layer                    │
│  ├ Encryption at Rest (D1/Postgres)   │
│  ├ Connection Pooling (TLS)           │
│  ├ Query Parameterization             │
│  └ Row-Level Security (if needed)     │
└────────────────────────────────────────┘
```

---

## Files to Modify

- `.env` (never commit secrets - use DO secret manager)
- `apps/algo-trader/src/middleware/auth.ts` (API key validation)
- `apps/algo-trader/src/middleware/rate-limiter.ts` (rate limiting)
- `apps/algo-trader/src/middleware/cors.ts` (CORS configuration)
- `apps/algo-trader/src/middleware/cloudflare.ts` (header verification)

---

## Implementation Steps

### Step 1: Secrets Management

**DO NOT store secrets in `.env` for production.**

```bash
# 1. Store secrets in DigitalOcean secret manager
./scripts/store-production-secrets.sh

# Secrets to store:
# - DATABASE_URL (production DB connection)
# - REDIS_URL (production Redis)
# - JWT_SECRET (for token signing)
# - API_KEY_ENCRYPTION_KEY (for API key encryption at rest)
# - ADMIN_TOKEN (for admin endpoints)
# - NOWPAYMENTS_API_KEY (billing)
# - SENDGRID_API_KEY (email)
# - TWILIO_AUTH_TOKEN (SMS)
# - TELEGRAM_BOT_TOKEN (telegram)

# 2. Verify secrets accessible
./scripts/check-secrets.sh
# Expected: All secrets readable by app, not in plaintext files

# 3. Scan for accidentally committed secrets
./scripts/scan-for-secrets.sh --history=all
# Expected: No findings (or only test/dev secrets)
```

**Secret rotation schedule:**
- API keys: 90 days
- JWT secret: 180 days
- Database passwords: 180 days
- External service keys: As per provider recommendation

---

### Step 2: API Key Authentication

**Implementation:** `apps/algo-trader/src/middleware/auth.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyApiKey } from '../services/auth-service';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    reply.code(401).send({ error: 'Missing API key' });
    return;
  }

  try {
    const tenant = await verifyApiKey(apiKey);
    request.tenant = tenant;  // Attach tenant to request context
    reply.tenant = tenant;
  } catch (error) {
    reply.code(401).send({ error: 'Invalid API key' });
    return;
  }
}

// Apply globally in app setup
app.register(authMiddleware, { prefix: '/api' });
```

**API key validation logic:**

```typescript
// src/services/auth-service.ts
import bcrypt from 'bcrypt';
import { db } from '../db';

export async function verifyApiKey(apiKey: string): Promise<Tenant> {
  // 1. Fetch tenant by API key hash
  const hashedKey = await bcrypt.hash(apiKey, 10); // Note: use constant-time compare
  const tenant = await db.tenant.findFirst({
    where: { apiKeyHash: hashedKey }
  });

  if (!tenant) {
    throw new Error('Invalid API key');
  }

  // 2. Check if tenant is active
  if (!tenant.active) {
    throw new Error('Tenant suspended');
  }

  // 3. Check expiry (90 days)
  const lastRotated = new Date(tenant.apiKeyLastRotated);
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  if (Date.now() - lastRotated.getTime() > ninetyDays) {
    throw new Error('API key expired - rotate required');
  }

  // 4. Log authentication event (audit)
  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: 'api_key_validation',
      ip: request.ip,
      userAgent: request.headers['user-agent']
    }
  });

  return tenant;
}
```

---

### Step 3: Rate Limiting

**Implementation:** `apps/algo-trader/src/middleware/rate-limiter.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RateLimiterRedis } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit',
  points: 100, // 100 requests
  duration: 60, // per 60 seconds
  blockDuration: 600 // block for 10 minutes if exceeded
});

export async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] as string;
  const ip = request.ip;

  try {
    // Rate limit by API key (primary) and IP (secondary)
    await rateLimiter.consume(apiKey);
    await rateLimiter.consume(ip);
  } catch (rejRes: any) {
    reply.code(429).send({
      error: 'Too many requests',
      retryAfter: Math.ceil(rejRes.msBeforeNext / 1000) || 60
    });
    return;
  }
}
```

**Configuration tuning:**

| Tenant Tier | Requests/min | Burst | Block Duration |
|-------------|--------------|-------|----------------|
| Free | 20 | 40 | 10m |
| Pro | 100 | 200 | 5m |
| Enterprise | 1000 | 2000 | 1m |

---

### Step 4: CORS Configuration

**Implementation:** `apps/algo-trader/src/middleware/cors.ts`

```typescript
import cors from '@fastify/cors';

const CORS_WHITELIST = [
  'https://cashclaw-dashboard.pages.dev',
  'https://app.cashclaw.com',
  'https://admin.cashclaw.com'
];

export async function corsMiddleware(app: FastifyInstance) {
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return cb(null, true);

      if (CORS_WHITELIST.indexOf(origin) === -1) {
        return cb(new Error('CORS origin not allowed'), false);
      }

      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
  });
}
```

---

### Step 5: Cloudflare Header Verification

**Implementation:** `apps/algo-trader/src/middleware/cloudflare.ts`

```typescript
export async function cloudflareMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Verify request came through Cloudflare
  const cfWorker = request.headers['cf-worker'];
  const cfConnectingIp = request.headers['cf-connecting-ip'];

  if (!cfWorker || !cfConnectingIp) {
    reply.code(403).send({ error: 'Invalid request source' });
    return;
  }

  // Optionally verify CF token (if using Argo/Token Tunnel)
  const cfToken = request.headers['cf-access-token'];
  if (process.env.CF_ACCESS_TOKEN) {
    const isValid = await verifyCfToken(cfToken);
    if (!isValid) {
      reply.code(403).send({ error: 'Invalid Cloudflare token' });
      return;
    }
  }

  // Trust CF-provided client IP
  request.ip = cfConnectingIp as string;
}
```

---

### Step 6: JWT Token Management

**Implementation:** `apps/algo-trader/src/services/jwt-service.ts`

```typescript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = '1h';  // Access token expiry
const REFRESH_EXPIRY = '30d';  // Refresh token expiry

export function generateAccessToken(tenantId: string): string {
  return jwt.sign(
    { tenantId, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function generateRefreshToken(tenantId: string): string {
  return jwt.sign(
    { tenantId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
}

export function verifyToken(token: string): { tenantId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return { tenantId: decoded.tenantId };
  } catch (error) {
    return null;
  }
}

// Refresh token rotation (security best practice)
export async function rotateRefreshToken(oldRefreshToken: string): Promise<{access: string, refresh: string}> {
  const decoded = verifyToken(oldRefreshToken);
  if (!decoded) throw new Error('Invalid refresh token');

  // Invalidate old token in DB
  await db.refreshToken.delete({ where: { token: oldRefreshToken } });

  // Issue new tokens
  const newAccess = generateAccessToken(decoded.tenantId);
  const newRefresh = generateRefreshToken(decoded.tenantId);

  // Store new refresh token hash
  await db.refreshToken.create({
    data: {
      tenantId: decoded.tenantId,
      tokenHash: await bcrypt.hash(newRefresh, 10),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  return { access: newAccess, refresh: newRefresh };
}
```

---

### Step 7: TLS Configuration

**Cloudflare-managed TLS (recommended):**
- Cloudflare provides free SSL certificates
- Automatic renewal
- HTTP → HTTPS redirect enforced

**If self-managed (not recommended):**

```nginx
# nginx config (if using nginx reverse proxy)
ssl_certificate /etc/ssl/certs/algo-trader.crt;
ssl_certificate_key /etc/ssl/private/algo-trader.key;
ssl_protocols TLSv1.3 TLSv1.2;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
```

---

### Step 8: Audit Logging

**Implementation:** `apps/algo-trader/src/services/audit-service.ts`

```typescript
export enum AuditAction {
  TENANT_CREATED = 'tenant.created',
  TENANT_UPDATED = 'tenant.updated',
  TENANT_DELETED = 'tenant.deleted',
  API_KEY_ROTATED = 'api_key.rotated',
  ADMIN_LOGIN = 'admin.login',
  ADMIN_LOGOUT = 'admin.logout',
  DATA_EXPORT = 'data.export',
  SHARD_REBALANCE = 'shard.rebalance',
  PAYMENT_PROCESSED = 'payment.processed'
}

export async function logAuditEvent(
  action: AuditAction,
  tenantId?: string,
  metadata?: Record<string, any>
) {
  await db.auditLog.create({
    data: {
      action,
      tenantId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      timestamp: new Date(),
      metadata: metadata || {}
    }
  });
}

// Usage in routes:
await logAuditEvent(AuditAction.TENANT_CREATED, tenant.id, { name: tenant.name });
```

**Audit log retention:** 7 years (for SOX compliance)

---

### Step 9: Input Validation

**Implementation:** `apps/algo-trader/src/middleware/validation.ts`

```typescript
import { z } from 'zod';

// Define schemas for all inputs
const tenantSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  tier: z.enum(['free', 'pro', 'enterprise']),
  settings: z.object({
    maxTenants: z.number().int().positive().optional(),
    enableAlerts: z.boolean().optional()
  }).optional()
});

export async function validateRequest(schema: z.ZodSchema, request: FastifyRequest) {
  try {
    const validated = schema.parse(request.body);
    request.validated = validated;
  } catch (error) {
    reply.code(400).send({ error: 'Validation failed', details: error.errors });
    return;
  }
}
```

---

### Step 10: Security Testing

```bash
# 1. Run security scan
./scripts/run-security-scan.sh
# Scans:
# - Dependencies (npm audit)
# - Secrets in code (truffleHog, gitleaks)
# - Port scanning (nmap on exposed ports)
# - TLS configuration (testssl.sh)
# - OWASP Top 10 vulnerabilities

# Expected: 0 HIGH or CRITICAL findings

# 2. Penetration test (if budget allows)
# Hire external security firm or run internal pentest

# 3. API security test
./scripts/test-api-security.sh
# Tests:
# - Rate limiting working
# - Invalid API keys rejected
# - CORS properly configured
# - SQL injection attempts blocked
# - XSS attempts sanitized
# - JWT tokens validated

# Expected: All security controls functioning
```

---

## Success Criteria

### Authentication & Authorization

- [ ] API key required for all protected endpoints
- [ ] Invalid API keys return 401
- [ ] Expired API keys return 401 with message
- [ ] Tenant isolation enforced (no cross-tenant data access)
- [ ] Admin endpoints require elevated permissions

### Rate Limiting

- [ ] Rate limiter active on all API endpoints
- [ ] Exceeding limit returns 429 with `Retry-After` header
- [ ] Different limits by tenant tier (free/pro/enterprise)
- [ ] Rate limit headers included in responses (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)

### Network Security

- [ ] All external traffic uses HTTPS (TLS 1.3)
- [ ] HTTP → HTTPS redirect active
- [ ] HSTS header set (`Strict-Transport-Security`)
- [ ] CORS whitelist configured (no `*`)
- [ ] Cloudflare WAF rules enabled

### Data Protection

- [ ] Database encrypted at rest (D1 managed encryption)
- [ ] No plaintext secrets in codebase
- [ ] Sensitive fields (API keys, passwords) stored hashed (bcrypt)
- [ ] PII data marked for encryption (if applicable)

### Audit & Compliance

- [ ] All admin actions logged with user ID, IP, timestamp
- [ ] Audit logs immutable (cannot be modified)
- [ ] Log retention 7 years (for SOX)
- [ ] SOC2 controls documented and tested

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API key leakage | Low | Critical | Rotate all keys, revoke compromised, audit logs |
| Rate limiter bypass | Low | High | Ensure middleware applied globally, test bypass attempts |
| CORS misconfiguration | Medium | Medium | Test with cURL from different origins |
| TLS certificate expiry | Low | Medium | Use Cloudflare managed certs (auto-renew) |
| Secret exposure in logs | Medium | High | Sanitize logs, no secrets in error messages |
| Audit log tampering | Low | High | Immutable storage, write-once principle |

---

## Compliance Checklist

### SOC2 Type 1

- [ ] Access controls documented and implemented
- [ ] Change management process documented
- [ ] Incident response procedures defined
- [ ] Data encryption at rest and in transit
- [ ] Backup and recovery tested
- [ ] Audit logging complete and retained

### GDPR (if EU users)

- [ ] Data processing agreement (DPA) available
- [ ] Right to deletion implemented (`DELETE /api/v1/tenants/:id/data`)
- [ ] Data export available (`GET /api/v1/tenants/:id/export`)
- [ ] Consent management for marketing
- [ ] Privacy policy published

### PCI DSS (if handling payments)

- [ ] No card data stored (use Stripe/NOWPayments)
- [ ] All payment APIs use TLS 1.2+
- [ ] Network segmentation (payment service isolated)
- [ ] Quarterly security scans
- [ ] Penetration test annually

---

## Security Testing Commands

```bash
# Test API authentication
curl -H "x-api-key: invalid" https://api.algo-trader.workers.dev/api/v1/tenants
# Expected: 401

# Test rate limiting
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "x-api-key: test-key" \
    https://api.algo-trader.workers.dev/api/v1/health
done | grep -c "429"
# Expected: Some 429 responses after limit exceeded

# Test CORS
curl -I -X OPTIONS https://api.algo-trader.workers.dev/api/v1/tenants \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: GET"
# Expected: Origin not in response (CORS denied)

# Test TLS
testssl.sh https://api.algo-trader.workers.dev
# Expected: TLS 1.3 supported, no weak ciphers, cert valid

# Test SQL injection
curl -X POST https://api.algo-trader.workers.dev/api/v1/tenants \
  -H "x-api-key: test-key" \
  -d '{"name":"test\' OR 1=1--"}'
# Expected: 400 (validation error), no SQL error, no data leak

# Test path traversal
curl https://api.algo-trader.workers.dev/api/v1/tenants/../../../etc/passwd
# Expected: 404 or 403, not file contents
```

---

## Next Steps

Upon successful security hardening:

1. Record evidence: `/mekong artifact scale-ready platform-operations "Security controls validated (auth, rate limiting, CORS, TLS, audit logging)"`
2. Document security posture in `docs/security-posture.md`
3. Schedule quarterly security review
4. Implement automated security scanning in CI/CD
5. Train team on secure coding practices
6. Plan annual penetration test

---

## Unresolved Questions

- [ ] Determine if WAF rules needed beyond Cloudflare (modsecurity?)
- [ ] Implement IP allowlist for admin endpoints (restrict to office IPs)
- [ ] Add WebAuthn/FIDO2 support for admin MFA
- [ ] Set up SIEM integration (splunk, datadog, etc.)
- [ ] Define data retention policies per data type (GDPR, CCPA)

---

## References

- [Security Controls Documentation](../docs/security-controls.md)
- [SOC2 Compliance Guide](../docs/soc2-compliance.md)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Cloudflare Security Best Practices](https://www.cloudflare.com/learning/)
