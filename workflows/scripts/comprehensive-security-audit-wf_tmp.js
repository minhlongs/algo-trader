export const meta = {
  name: 'comprehensive-security-audit',
  description: 'Comprehensive security code review: audit all code for vulnerabilities, secrets, injection risks, auth issues',
  phases: [
    { title: 'Security Audit Planning', detail: 'Define audit scope, tools, checklists' },
    { title: 'Static Analysis', detail: 'Run SAST tools (Semgrep, CodeQL)' },
    { title: 'Secrets Scanning', detail: 'Scan for hardcoded secrets, API keys' },
    { title: 'Authentication & Authorization Review', detail: 'Review all auth flows, RBAC, session management' },
    { title: 'Injection Vulnerability Review', detail: 'SQL, NoSQL, command injection, XSS, SSRF' },
    { title: 'Cryptography Review', detail: 'Review crypto usage, key management' },
    { title: 'API Security Review', detail: 'Rate limiting, input validation, CORS' },
    { title: 'Infrastructure Security', detail: 'Cloudflare, DO, Redis security configs' },
    { title: 'Remediation', detail: 'Fix all critical/high findings' },
    { title: 'Final Sign-off', detail: 'Security team approval' },
  ],
};

phase('Planning');
const planning = await agent('Security Audit Plan', {
  label: 'security-audit-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan comprehensive security audit. Task #10.

Scope:
- All TypeScript/JavaScript code
- Infrastructure configs (wrangler.toml, terraform)
- Secrets management
- Authentication/authorization
- API security
- Data protection

Tools:
- Semgrep for SAST
- gitleaks for secrets
- Manual code review for critical paths

Create plan: ./plans/security-audit/plan.md

`,
});

phase('Static Analysis');
const sast = await parallel([
  () => agent('Run Semgrep Security Scan', {
    label: 'semgrep-scan',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Run Semgrep with security rules:

1. Install: semgrep --config=p/auto
2. Scan all .ts, .js files
3. Focus on:
   - Hardcoded secrets (slack, telegram tokens)
   - SQL injection risks
   - Command injection
   - Path traversal
   - Insecure deserialization
   - Weak cryptography

4. Generate report: semgrep-report.json
5. Fix all HIGH severity findings

`,
  }),
  () => agent('Run CodeQL Analysis', {
    label: 'codeql-scan',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `CodeQL analysis:

1. Initialize CodeQL database: codeql database create --language=javascript
2. Run security queries:
   - js/insecure-dependency
   - js/code-injection
   - js/path-injection
   - js/unsafe-regex
   - js/hardcoded-secret

3. Export results to SARIF
4. Review and fix HIGH findings

`,
  }),
]);

phase('Secrets Scanning');
const secrets = await parallel([
  () => agent('Scan for Hardcoded Secrets', {
    label: 'secrets-scan',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Secrets scanning:

1. Run gitleaks:
   gitleaks detect --source . --report-path gitleaks.json

2. Manual grep for common patterns:
   - API keys: sk_live_, Bearer, Basic
   - Database URLs: postgres://, mysql://
   - Private keys: -----BEGIN PRIVATE KEY-----
   - JWT secrets
   - OAuth client secrets

3. Check .env files: ensure .env in .gitignore
4. Verify Cloudflare Workers secrets are not in code

All secrets found → rotate immediately, remove from code.

`,
  }),
  () => agent('Review Secrets Management', {
    label: 'secrets-mgmt-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Review secrets management:

How secrets are stored:
1. Cloudflare Workers: secrets via wrangler secret:set
2. Terraform: use tfvars + environment variables
3. Local dev: .env.local (never committed)

Check:
- All secrets use environment variables or secret manager
- No hardcoded credentials in source
- Rotation policies documented
- Access controls on secret manager

Document gaps and fix.

`,
  }),
]);

phase('Auth & Authorization Review');
const auth = await parallel([
  () => agent('Review Authentication Flows', {
    label: 'auth-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Authentication security review:

1. JWT implementation:
   - Strong secret (256-bit minimum)
   - Short expiry (15min access, 7d refresh)
   - Refresh token rotation
   - Token revocation on logout

2. Session management:
   - Secure, HttpOnly cookies
   - SameSite=Strict/Lax
   - Session timeout

3. Password handling:
   - bcrypt/argon2 hashing
   - No plaintext storage
   - Password strength enforcement

4. 2FA: TOTP implementation, backup codes

Review code: src/middleware/auth.ts, src/api/auth/routes.ts

`,
  }),
  () => agent('Review Authorization (RBAC)', {
    label: 'rbac-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `RBAC authorization review:

Check:
1. Role definitions: admin, user, read-only
2. Permission checks on every endpoint
3. Tenant isolation: users can't access other tenants
4. Admin endpoints properly guarded
5. API key permissions: read vs write vs admin

Code to review:
- src/middleware/require-role.ts
- src/api/**/routes.ts (all endpoints)
- src/services/tenant-isolation.service.ts

Look for: missing checks, overly permissive roles, horizontal privilege escalation.

`,
  }),
]);

phase('Injection Vulnerability Review');
const injection = await parallel([
  () => agent('Review SQL Injection Risks', {
    label: 'sql-injection-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `SQL injection review:

1. Search for raw SQL queries:
   grep -r "SELECT.*FROM" src/ --include="*.ts"
   grep -r "execute(" src/ --include="*.ts"

2. Verify all queries use parameterized statements:
   - ✅ GOOD: db.query("SELECT * FROM users WHERE id = $1", [id])
   - ❌ BAD: db.query(\`SELECT * FROM users WHERE id = \${id}\`)

3. Check ORM usage (Drizzle/Prisma) - usually safe
4. Review any string concatenation in queries

Fix any unsafe queries immediately.

`,
  }),
  () => agent('Review XSS Vulnerabilities', {
    label: 'xss-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `XSS review:

1. React apps: auto-escape by default, but check:
   - dangerouslySetInnerHTML usage
   - JSON injection in <script> tags
   - URL parameters reflected in page

2. API responses: sanitize any user-generated content before storage

3. CSP headers: verify configured (default-src 'self')

4. Check: src/middleware/xss-protection.ts exists and active

`,
  }),
  () => agent('Review SSRF Risks', {
    label: 'ssrf-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `SSRF (Server-Side Request Forgery) review:

1. Any endpoint that fetches external URLs?
   - Webhook ingestion
   - Image proxy
   - File download from user-provided URL

2. Validate:
   - URL scheme (only http/https)
   - Block private IP ranges (10.0.0.0/8, 192.168.0.0/16, localhost)
   - Block cloud metadata endpoints (169.254.169.254)

3. Use allowlist for permitted domains if possible

Review: src/services/webhook.service.ts, any fetch() calls.

`,
  }),
]);

phase('Cryptography Review');
const crypto = await parallel([
  () => agent('Review Cryptographic Implementations', {
    label: 'crypto-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Cryptography review:

1. Check crypto library usage:
   - ✅ Use Node.js crypto or WebCrypto API
   - ❌ No custom crypto, no homegrown algorithms

2. Review:
   - Encryption: AES-256-GCM
   - Hashing: SHA-256, bcrypt/argon2 for passwords
   - Random: crypto.randomBytes (not Math.random)
   - Signing: HMAC-SHA256

3. Key management:
   - Keys from environment variables/secrets
   - No hardcoded keys
   - Key rotation capability

Search: src/**/*.ts for "crypto", "md5", "sha1" (bad), "random("

`,
  }),
  () => agent('Review TLS Configuration', {
    label: 'tls-review',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `TLS configuration review:

1. Cloudflare Workers: TLS handled by Cloudflare (good)
2. DO/Redis/DB connections: verify TLS enabled
3. Certificate validation: proper CA validation
4. TLS version: 1.2 minimum, 1.3 preferred

Check:
- wrangler.toml: routes use https
- Database connection strings: postgresql://...?sslmode=require
- Redis: rediss:// or stunnel

`,
  }),
]);

phase('API Security Review');
const api = await parallel([
  () => agent('Review Rate Limiting Implementation', {
    label: 'rate-limit-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Rate limiting security review:

1. Check: src/middleware/rate-limiter.ts
2. Verify:
   - Limits enforced per tenant/IP
   - Not bypassable by changing headers
   - Distributed across shards (Redis)
   - Burst handling works
   - Limits appropriate per plan

3. Look for:
   - Bypass via different endpoints
   - In-memory only (bypass via multiple instances)
   - Missing on critical endpoints (auth, payment)

`,
  }),
  () => agent('Review CORS Configuration', {
    label: 'cors-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `CORS security review:

1. Check: src/middleware/cors.ts
2. Verify:
   - origins allowlist configured (not *)
   - Credentials allowed only for trusted origins
   - Methods limited to necessary (GET, POST, PUT, DELETE)
   - Max-Age reasonable
   - Vary: Origin header set

3. Test: preflight requests respond correctly
4. No sensitive endpoints accessible via CORS

`,
  }),
  () => agent('Review Input Validation', {
    label: 'input-validation-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Input validation security review:

1. All API endpoints validate inputs?
2. Check for missing validation on:
   - File uploads (size, type, path traversal)
   - JSON bodies (type, length, range)
   - Query parameters (injection)
   - Path parameters (type validation)

3. Review: src/middleware/validation-middleware.ts
4. Verify no eval(), exec(), child_process with user input

`,
  }),
]);

phase('Infrastructure Security');
const infra = await parallel([
  () => agent('Review Cloudflare Configuration', {
    label: 'cloudflare-security',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Cloudflare security review:

1. WAF rules enabled?
2. DDoS protection active?
3. API Shield for API routes?
4. Access rules: IP allowlist for admin?
5. Workers secrets properly set (no plaintext in wrangler.toml)
6. SSL/TLS: Full (strict) mode
7. Bot Fight Mode enabled?

Check config: wrangler.toml, Cloudflare dashboard settings.

`,
  }),
  () => agent('Review DO Security', {
    label: 'do-security',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Durable Objects security:

1. Access control: only Cloudflare Workers can invoke?
2. No public endpoints exposed (internal only)
3. Rate limiting per DO
4. Memory limits enforced
5. Alarm thresholds set

DO code review: check for:
- Input validation in DO handlers
- No secrets in DO code
- Proper error handling (no stack traces to client)

`,
  }),
  () => agent('Review Redis Security', {
    label: 'redis-security',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Redis security review:

1. Authentication: requirepass set?
2. Network: only internal connections (no public)
3. TLS: encrypted connections (rediss://)
4. Commands: dangerous commands disabled (FLUSHDB, CONFIG)?
5. ACLs: separate users for different purposes
6. Max memory policy configured
7. Persistence: RDB/AOF secure?

Check: docker-compose.redis.yml, redis.conf

`,
  }),
]);

phase('Remediation');
const remediation = await parallel([
  () => agent('Fix Critical Findings', {
    label: 'fix-critical',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Fix all CRITICAL findings from audit:

Prioritize:
1. Secrets exposed → rotate + remove
2. SQL injection → parameterize queries
3. Missing auth → add authorization checks
4. XSS risks → sanitize or escape
5. SSRF → block private IPs

Commit fixes with descriptive messages.

`,
  }),
  () => agent('Fix High Findings', {
    label: 'fix-high',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Fix HIGH severity findings:

May include:
- Weak cryptography (MD5, SHA1) → upgrade
- Missing rate limiting on some endpoints
- CORS overly permissive
- Missing input validation
- Information disclosure in errors

`,
  }),
  () => agent('Re-run Security Scans', {
    label: 'rescan',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Re-run security scans after fixes:

1. Semgrep → ensure no HIGH/CRITICAL remain
2. gitleaks → no new secrets
3. Manual verification of fixed issues

Generate final security report.

`,
  }),
]);

phase('Sign-off');
const signoff = await parallel([
  () => agent('Generate Security Audit Report', {
    label: 'security-report',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Security audit report:

Summary:
- Total vulnerabilities found: X
- Critical: 0 (target)
- High: 0 (target)
- Medium: Y
- Low: Z

Remediation:
- All critical/high fixed
- Medium findings with mitigation plan
- Low findings accepted (risk documented)

Attachments:
- Semgrep report
- gitleaks report
- CodeQL results

Report: docs/reports/security-audit-2025-06-22.md

`,
  }),
  () => agent('Security Sign-off', {
    label: 'security-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Final security sign-off.

Review:
✅ All critical vulnerabilities fixed
✅ High vulnerabilities addressed
✅ Secrets properly managed
✅ Auth/authorization secure
✅ Injection risks mitigated
✅ Infrastructure security verified
✅ Re-scans clean

Decision: SECURITY AUDIT PASSED - PRODUCTION READY.

`,
  }),
]);

log('Comprehensive Security Audit workflow launched');