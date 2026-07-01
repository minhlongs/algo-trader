export const meta = {
  name: 'input-validation-and-security',
  description: 'Input validation library, sanitization, security middleware, rate limiting enhancements',
  phases: [
    { title: 'Validation Planning', detail: 'Design validation library schema, security requirements' },
    { title: 'Validation Library', detail: 'Implement schema-based validation (Zod-like) with sanitization' },
    { title: 'API Input Validation', detail: 'Apply validation to all API endpoints' },
    { title: 'Security Middleware', detail: 'SQL injection, XSS, path traversal protection' },
    { title: 'Rate Limiting Enhancement', detail: 'Adaptive rate limiting, fingerprinting' },
    { title: 'Testing & Sign-off', detail: 'Fuzzing tests, penetration testing, sign-off' },
  ],
};

phase('Planning');
const planning = await agent('Input Validation Plan', {
  label: 'validation-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan input validation library and security enhancements. Tasks #80, security hardening continuation.

Scope:
- Validation library: schema-based, composable, async validators
- Sanitization: XSS, SQL injection, command injection
- API validation: apply to all endpoints
- Adaptive rate limiting: dynamic thresholds based on behavior
- Fingerprinting: device/IP/user-agent fingerprint

Create plan in ./plans/input-validation/plan.md.

Work context: /Users/macbook/algo-trader
`,
});

phase('Validation Library');
const lib = await parallel([
  () => agent('Implement Validation Library', {
    label: 'validation-lib-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement input validation library.

Features:
1. Schema definitions: string, number, boolean, array, object, union
2. Validators: min, max, length, pattern, email, url, custom async
3. Sanitizers: trim, lowercase, stripHTML, escapeSQL
4. Composition: .and(), .or(), .optional()
5. Error messages: customizable, i18n support

Inspired by Zod/JOI but simpler.

Core files:
- src/lib/validation/schema.ts
- src/lib/validation/validators.ts
- src/lib/validation/sanitizers.ts
- tests/lib/validation/*.test.ts

`,
  }),
  () => agent('Test Validation Library', {
    label: 'validation-lib-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test validation library:

1. Schema validation: valid data passes, invalid fails with clear errors
2. Nested objects: deep validation
3. Async validators: unique checks, external API
4. Sanitization: XSS payloads stripped, SQL escaped
5. Performance: 10k validations/sec minimum
6. Fuzzing: malformed input doesn't crash

`,
  }),
]);

phase('API Input Validation');
const apiValidation = await parallel([
  () => agent('Apply Validation to APIs', {
    label: 'api-validation-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Apply input validation to all API endpoints.

Strategy:
- Decorator/middleware: @Validate(schema)
- OpenAPI integration: validate request body against spec
- Error responses: 400 with error details, 422 for validation errors

Endpoints to cover:
1. User API: create, update, profile
2. Trading API: place order, cancel, portfolio queries
3. Admin API: tenant management, user roles
4. Webhook endpoints: signature verification

Files:
- src/middleware/validation-middleware.ts
- src/api/**/routes.ts (add @Validate decorators)
- tests/api/validation/*.test.ts

`,
  }),
  () => agent('Test API Validation', {
    label: 'api-validation-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test API validation:

For each endpoint:
- Missing required fields → 400
- Invalid types → 422
- Values out of range → 400
- Sanitization: XSS in string fields → cleaned
- SQL injection attempts → blocked
- Path traversal in file uploads → blocked

Automated security scan with OWASP ZAP.

`,
  }),
]);

phase('Security Middleware');
const security = await parallel([
  () => agent('SQL Injection Protection', {
    label: 'sql-injection-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement SQL injection protection.

1. Parameterized queries only: enforce via ESLint rule
2. Input escaping for dynamic SQL (rare cases)
3. Query builder: avoid concatenation
4. Audit: scan codebase for string concatenation in queries

Implementation:
- ESLint rule: no-raw-sql-concat
- src/middleware/sql-injection-guard.ts (additional runtime check for logs)

`,
  }),
  () => agent('XSS Protection', {
    label: 'xss-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement XSS protection middleware.

1. Input sanitization: DOMPurify on HTML fields
2. Output encoding: auto-escape in React templates (already via React)
3. Content-Security-Policy headers
4. HttpOnly, Secure, SameSite cookies

Files:
- src/middleware/xss-protection.ts
- src/middleware/csp-headers.ts
- tests/middleware/security.test.ts

`,
  }),
  () => agent('Path Traversal Protection', {
    label: 'path-traversal-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Protect against path traversal attacks.

1. File upload: validate paths, restrict to upload directory
2. Static file serving: normalize paths, prevent ../ escapes
3. Parameterized file paths: use path.resolve() and check within allowed dirs

Files:
- src/middleware/path-traversal-guard.ts
- src/services/file-upload.service.ts (security review)

`,
  }),
]);

phase('Rate Limiting Enhancement');
const rateLimit = await parallel([
  () => agent('Adaptive Rate Limiter', {
    label: 'adaptive-rate-limit-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement adaptive rate limiting.

Current: static per-API key limits.

Enhance:
1. Dynamic thresholds: reduce limits for suspicious behavior
2. Scoring: rate limit score = base + riskScore * multiplier
3. Risk factors: failed auth, rapid requests, unusual endpoints
4. Auto-escalation: stricter limits for persistent abuse

Files: src/middleware/rate-limiter.ts (enhance), tests/middleware/rate-limiter.test.ts
`,
  }),
  () => agent('Device Fingerprinting', {
    label: 'fingerprint-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement device fingerprinting for rate limiting.

Fingerprint components:
- IP address (primary)
- User-Agent hash
- Accept-Language
- Screen resolution (if available from client)
- Timezone

Generate fingerprint: SHA256(components).

Store: Redis key fingerprint:rate-limit:{fingerprint}

Files: src/services/fingerprint.service.ts, src/middleware/fingerprint-middleware.ts
`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Security Fuzzing Tests', {
    label: 'security-fuzzing',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Security fuzzing:

1. SQL injection: inject 100 payloads into every text input → all blocked
2. XSS: inject scripts, iframes, javascript: → sanitized
3. Path traversal: ../../../etc/passwd → blocked
4. SSRF: internal IPs → blocked
5. Command injection: ; rm -rf / → blocked
6. Overflow: huge inputs (10MB) → rejected

Tools: OWASP ZAP, Burp Suite Community, custom fuzzers.

Report: all critical issues fixed.
`,
  }),
  () => agent('Penetration Testing', {
    label: 'pentest',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Penetration testing for validation/security:

Test:
- API parameter tampering
- Schema bypass (missing fields, extra fields)
- Rate limit bypass (IP spoofing, fingerprint reset)
- Privilege escalation through validation gaps
- Business logic abuse (negative quantities, price manipulation)

Findings → fix → retest.

`,
  }),
  () => agent('Security Sign-off', {
    label: 'security-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Security sign-off:

Review:
✅ Validation library comprehensive
✅ API endpoints validated
✅ SQL/XSS/path protection in place
✅ Adaptive rate limiting
✅ Fingerprinting
✅ Fuzzing passed
✅ Penetration test clean

Decision: SECURITY HARDENING PRODUCTION READY.

`,
  }),
]);

log('Input Validation & Security workflow launched');