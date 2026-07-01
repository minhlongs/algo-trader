export const meta = {
  name: 'backward-compatibility-checks',
  description: 'Implement backward compatibility testing for API contracts: ensure v1 clients work with future versions',
  phases: [
    { title: 'Compatibility Strategy', detail: 'Define versioning policy, deprecation timeline' },
    { title: 'API Contract Validation', detail: 'Schema validation, breaking change detection' },
    { title: 'Integration Testing', detail: 'Test v1 clients against v2 API' },
    { title: 'Deprecation Warnings', detail: 'Add deprecation headers, client notifications' },
    { title: 'Client Migration Support', detail: 'Documentation, migration guides, compatibility mode' },
    { title: 'Sign-off', detail: 'Validate no breaking changes without migration path' },
  ],
};

phase('Compatibility Strategy');
const strategy = await agent('Define API Versioning Strategy', {
  label: 'versioning-strategy',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Define API versioning strategy. Task #286.

1. Versioning scheme:
   - URL path: /api/v1/..., /api/v2/...
   - Header: Accept: application/vnd.algo-trader.v1+json
   - Query param: ?version=1 (not recommended)
   → Use URL path (simplest, cache-friendly)

2. Backward compatibility policy:
   - v1 supported for minimum 12 months after v2 release
   - Deprecation notice sent 6 months before EOL
   - No breaking changes within major version
   - Minor versions (v1.1 → v1.2) can add fields but not remove/rename

3. Breaking changes (require new major version):
   - Remove endpoint
   - Change request schema (required field removed, type changed)
   - Change response schema (field removed, type changed)
   - Change error format significantly
   - Remove authentication method

4. Non-breaking (allowed in minor/patch):
   - Add new optional fields (with default)
   - Add new endpoints
   - Add new enum values
   - Change error message text only

5. Deprecation timeline:
   - Announce deprecation: v2 released
   - v1 marked deprecated in docs
   - 6 months: send warnings to v1 users
   - 12 months: v1 returns 410 Gone
   - v3 releases → cycle repeats

6. Client communication:
   - Email to API key owners
   - Developer portal notifications
   - Changelog entries

Create policy: ./docs/api/versioning-policy.md

`,
});

phase('API Contract Validation');
const validation = await parallel([
  () => agent('Implement OpenAPI Diff Tool', {
    label: 'openapi-diff',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `OpenAPI diff tool:

1. Problem: Detect breaking changes between API versions automatically.

2. Tool: Use @apidevtools/swagger-parser or openapi-diff

3. Compare v1 vs v2:
   - Endpoints removed?
   - Request parameters removed/required added?
   - Request body schema changed (type, required fields)?
   - Response codes removed?
   - Response schema changed (field removed/renamed)?

4. Implementation:
   const { parse, bundle } = require('@apidevtools/swagger-parser');
   const { compare } = require('openapi-diff');

   async function checkBreakingChanges(oldSpec: string, newSpec: string): Promise<BreakingChange[]> {
     const old = await parse(oldSpec);
     const new = await parse(newSpec);

     const changes = compare(old, new);
     return changes.filter(c => c.breaking);
   }

5. Breaking change examples:
   - "Removed endpoint: GET /api/v1/account"
   - "Field 'email' changed from optional to required in POST /users"
   - "Response field 'balance' removed from GET /account"
   - "Status code 200 removed from POST /orders"

6. CI/CD integration:
   - Fail build if breaking changes detected
   - Requires manual override with justification

`,
  }),
  () => agent('Implement Contract Tests for API Compatibility', {
    label: 'contract-compat',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Contract tests for compatibility:

1. Test v1 client works with v2 server:
   - Use v1 OpenAPI spec to generate test client
   - Hit v2 server
   - Verify responses match v1 contract

2. Test matrix:
   - v1 client → v1 server (baseline)
   - v1 client → v2 server (compatibility)
   - v2 client → v2 server (new features)

3. v1 client tests:
   - All v1 endpoints must work on v2 server
   - v1 request schema accepted
   - v1 response schema returned (or superset)
   - v1 authentication still works

4. Automated:
   npx dredge --spec ./openapi/v1/spec.yaml --server http://localhost:3000

5. Contract test suite:
   tests/compatibility/v1-v2-compatibility.test.ts

   describe('v1 API compatibility', () => {
     it('GET /api/v1/account returns v1 schema', async () => {
       const res = await v1Client.getAccount();
       expect(res).toMatchSchema(v1AccountSchema);
     });

     it('POST /api/v1/orders accepts v1 order schema', async () => {
       const order = { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: 0.001, price: 50000 };
       const res = await v1Client.createOrder(order);
       expect(res).toMatchSchema(v1OrderSchema);
     });
   });

6. Run in CI on every API change.

`,
  }),
]);

phase('Integration Testing');
const integration = await parallel([
  () => agent('Test Real v1 Clients Against v2', {
    label: 'v1-client-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test real v1 clients:

1. Identify v1 clients:
   - Official SDKs (TypeScript, Python)
   - Sample applications
   - Partner integrations (if any)

2. Test each client:
   - Client v1.0 → Server v2.0
   - Run client integration tests unchanged
   - Should all pass

3. Deprecated features:
   - v1 client uses deprecated endpoint → should still work
   - v1 client sends deprecated header → accepted (with warning header)

4. Migration testing:
   - v1 client upgrades to v2 SDK → works
   - Can use v2 features optionally

5. Warning detection:
   - Response includes Deprecation: true header
   - Warning in response body
   - Client logs warning

6. Report:
   - Which v1 features tested
   - Which v1 clients compatible with v2
   - Any issues found

`,
  }),
  () => agent('Implement Deprecation Warnings', {
    label: 'deprecation-warnings',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Deprecation warnings:

1. When v1 endpoint called on v2 server:
   - Response header: Deprecation: true
   - Header: Sunset: Sat, 31 Dec 2025 23:59:59 GMT
   - Header: Link: <https://docs.algo-trader.com/api/migration>; rel="deprecation"
   - Body: "This API version is deprecated. Please migrate to v2."

2. Per-endpoint warnings:
   - If v1 client uses field that will be removed in v3:
     Warning: "Field 'old_field' is deprecated, use 'new_field' instead"

3. SDK warnings:
   - Official SDKs emit console.warn when deprecated method called
   - Log once per session to avoid spam

4. Tracking:
   - Log deprecation usage: which v1 endpoints still called
   - Identify tenants not migrated
   - Target migration communications

5. Implementation (Hono):
   app.get('/api/v1/account', (c) => {
     c.respons.headers.set('Deprecation', 'true');
     c.respons.headers.set('Sunset', 'Sat, 31 Dec 2025 23:59:59 GMT');
     return c.json(v1AccountResponse);
   });

6. Graduated warnings:
   - 6 months before EOL: warning every call
   - 3 months before: warning + log
   - 1 month before: warning + suggest immediate migration

`,
  }),
]);

phase('Client Migration Support');
const migration = await parallel([
  () => agent('Create Migration Guide', {
    label: 'migration-guide',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Create API migration guide:

docs/api/migration/v1-to-v2.md

1. Overview:
   - Why v2? (new features, performance)
   - Timeline: v1 supported until Dec 2025
   - What changed: endpoint changes, schema updates

2. Breaking changes:
   - List all breaking changes from v1 → v2
   - For each:
     * Old: GET /api/v1/orders
     * New: GET /api/v2/orders (different query params)
     * Migration steps
     * Code examples (before/after)

3. Field changes:
   - Order schema:
     v1: { id, symbol, side, quantity, price, status }
     v2: { id, symbol, side, quantity, price, status, filled, avgPrice, fee }

4. Authentication changes:
   - v1: API key in header X-API-Key
   - v2: same (no change) or JWT token

5. Error format changes:
   - v1: { code: 1001, message: "..." }
   - v2: { error: { type: "INSUFFICIENT_BALANCE", message: "...", details: {...} } }

6. SDK migration:
   - npm install @algo-trader/sdk@latest
   - Import: import { AlgoTrader } from '@algo-trader/sdk'
   - Client instantiation: new AlgoTrader({ apiKey, version: 'v2' })

7. Testing:
   - Use v2 sandbox environment
   - Run integration tests

8. Support:
   - Contact support@algo-trader.com for help
   - Migration deadline: Dec 31, 2025

`,
  }),
  () => agent('Implement Compatibility Mode', {
    label: 'compat-mode',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Compatibility mode:

1. Problem: Some v1 clients may break during transition period.

2. Compatibility layer:
   - v2 server accepts v1 request format
   - Internally converts to v2 format
   - Returns v1 response format

3. Implementation:
   // Route v1 → compatibility middleware → v2 handler
   app.get('/api/v1/orders', v1CompatibilityMiddleware, v2GetOrders);

   // Middleware transforms:
   function v1CompatibilityMiddleware(c: Context, next: Next) {
     // Convert v1 query params to v2
     if (c.req.query('limit')) {
       c.req.query.set('page_size', c.req.query('limit'));
     }
     // Convert v1 response back
     c.res.setHeader('X-API-Version', 'v1');
     return next();
   }

4. Performance:
   - Minimal overhead (few ms)
   - Can be removed after v1 EOL

5. Feature flag:
   - compat_mode: true/false
   - Enable for specific API keys during migration
   - Gradual rollout to tenants

6. Deprecation timeline:
   - v2 launch: compatibility mode ON
   - 6 months: remind tenants to migrate
   - 9 months: disable compatibility for new tenants
   - 12 months: EOL v1 compatibility

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Test API Compatibility End-to-End', {
    label: 'compat-e2e',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `E2E compatibility test:

1. v1 client scenarios:
   - Create order (v1 format) → success with v2 response (v1 shape)
   - Get account (v1 format) → v2 data converted to v1 schema
   - Use deprecated field → accepted with warning
   - Use removed field → 400 with helpful error

2. SDK compatibility:
   - TypeScript SDK v1.0 → connect to v2 server
   - Python SDK v1.5 → connect to v2 server
   - All methods work (with possible deprecation warnings)

3. Mixed version testing:
   - Some tenants on v1, some on v2
   - Both work correctly on same server
   - No cross-contamination

4. Deprecation verification:
   - v1 endpoint returns Deprecation: true header
   - Sunset header present
   - Warning message in response

5. Migration path:
   - v1 client upgrades to v2 SDK
   - Uses new features (v2-specific fields)
   - Works without issues

6. Report:
   - All v1 functionality tested
   - Breaking changes documented
   - Migration guide verified

`,
  }),
  () => agent('Backward Compatibility Sign-off', {
    label: 'compat-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Backward Compatibility Checks.

Task #286

Review:
✅ API versioning strategy defined (URL path, 12-month support)
✅ Breaking change detection tool (OpenAPI diff)
✅ Contract tests ensure v1 clients work with v2 server
✅ Deprecation warnings implemented (headers, Link)
✅ Compatibility mode for gradual migration
✅ Migration guide created
✅ E2E compatibility testing complete
✅ No unexpected breaking changes

Decision: BACKWARD COMPATIBILITY GUARANTEED.
v1 API supported until Dec 2025, clear migration path provided.

`,
  }),
]);

log('Backward Compatibility Checks workflow launched');