export const meta = {
  name: 'input-validation-library',
  description: 'Implement comprehensive input validation library: schema validation, sanitization, type coercion, security checks',
  phases: [
    { title: 'Validation Library Planning', detail: 'Design validation API, schema format, integration points' },
    { title: 'Schema Validation Engine', detail: 'Implement Zod-like schema validation with custom types' },
    { title: 'Sanitization & Coercion', detail: 'Input sanitization, type conversions, normalization' },
    { title: 'Security Validators', detail: 'SQL injection, XSS, SSRF, path traversal prevention' },
    { title: 'Integration with API', detail: 'Middleware integration, error responses' },
    { title: 'Testing & Documentation', detail: 'Comprehensive tests, usage docs' },
  ],
};

phase('Planning');
const planning = await agent('Validation Library Plan', {
  label: 'validation-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan input validation library. Task #80.

Requirements:
1. Schema-based validation (like Zod, Yup, Joi)
2. TypeScript types inferred from schemas
3. Common validators: string, number, boolean, array, object, union, optional
4. Custom validators: email, url, uuid, date, enum, regex
5. Sanitization: trim, lowercase, escape HTML, strip scripts
6. Security: detect SQL injection patterns, XSS payloads, SSRF URLs
7. Coercion: string→number, string→date, etc.
8. Error messages: detailed, field-level errors

Integration:
- API middleware: validate request body, query, params
- Forms: client-side validation (shared schemas)
- Database: validate before insert/update

Create plan: ./plans/input-validation/plan.md
`,
});

phase('Schema Validation Engine');
const engine = await parallel([
  () => agent('Implement Core Validation', {
    label: 'core-validation',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Core validation library:

1. Schema definitions:
   const userSchema = object({
     id: uuid(),
     email: string().email(),
     age: number().int().min(18).max(120),
     name: string().min(1).max(100),
     roles: array(enum(['user','admin'])).optional(),
   });

2. Validation function:
   function validate(schema, data): Result<ValidData, ValidationErrors>
   - Deep validation of nested objects
   - Collect all errors, not just first
   - Return path to error: "user.address.city"

3. Type inference:
   type User = z.infer<typeof userSchema>;

4. Async validators:
   - Check email uniqueness in DB
   - Verify external API constraints

Library structure:
   src/validation/
   - schema.ts (base Schema class)
   - types.ts (validation result types)
   - primitives.ts (string, number, boolean validators)
   - complex.ts (object, array, union, tuple)
   - index.ts (public API)

`,
  }),
  () => agent('Implement Common Validators', {
    label: 'common-validators',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Common validators:

String:
- min(length), max(length), length(exact)
- regex(pattern), email(), url(), uuid(), ip()
- alpha(), alphanumeric(), base64()
- lowercase(), uppercase(), trim()

Number:
- min(), max(), int(), positive(), negative()
- multiple(of), finite()

Date:
- min(date), max(date), future(), past()
- iso(), timestamp()

Enums:
- enum([...values])
- literal('value')

Custom:
- custom(validatorFn: (val) => boolean|string error)
- refine(schema, refinementFn)

Array:
- min(length), max(length)
- uniqueBy(key)
- nonEmpty()

Object:
- shape({ field: schema })
- partial(schema)  // all optional
- strict()  // no extra keys

`,
  }),
]);

phase('Sanitization & Coercion');
const sanitize = await parallel([
  () => agent('Implement Input Sanitization', {
    label: 'sanitization',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Input sanitization:

1. String sanitization:
   - trim(): remove leading/trailing whitespace
   - stripHtml(): remove HTML tags (keep text)
   - escapeHtml(): escape <>&"'
   - normalize(): Unicode normalization (NFC)
   - collapseSpaces(): multiple spaces → single

2. Type coercion:
   - string → number: parseFloat, fallback NaN check
   - string → boolean: "true","1" → true
   - string → date: Date.parse with timezone handling
   - array from CSV: "a,b,c" → ["a","b","c"]
   - number → string: String(num)

3. Default values:
   - optional().default(value)
   - null/undefined replaced with default

4. Transforms:
   - transform(fn): post-validation modify
   - lowercase(), uppercase()
   - formatDate(pattern)

Example:
   const schema = string().trim().lowercase().email();

`,
  }),
  () => agent('Implement Security Sanitizers', {
    label: 'security-sanitizers',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Security sanitizers:

1. SQL injection detection:
   - Detect: ' OR 1=1, '; DROP, UNION SELECT
   - Blacklist/pattern matching (not perfect)
   - Better: use parameterized queries, but validator can flag suspicious input
   - Validator: sqlInjectionSafe() → rejects dangerous patterns

2. XSS prevention:
   - stripHtml(): remove <script>, onclick, javascript:
   - escapeHtml(): encode special chars
   - urlEncode() for URL params

3. SSRF prevention:
   - url() validator:
     * Must be http/https
     * Block private IPs: 10.x, 192.168.x, 127.0.0.1, ::1
     * Block cloud metadata: 169.254.169.254
     * Optional: allowlist domains
   - validator: ssrfSafe(url)

4. Path traversal:
   - filePath() validator:
     * Resolve path
     * Ensure within allowed directory
     * Reject .., symlinks outside

5. Command injection:
   - Detect shell metacharacters: ;, &&, ||, $(), backticks
   - Reject in fields used in exec()

`,
  }),
]);

phase('Security Validators');
const security = await parallel([
  () => agent('Create Security Validation Rules', {
    label: 'security-rules',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Security validation rules:

1. SQL injection pattern detection:
   const sqlInjection = custom((val) => {
     const patterns = [
       /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC)\b)/i,
       /(1=1|1=0|OR\s+TRUE|AND\s+TRUE)/i,
       /(--|\#|\/\*)/,  // comments
       /(WAITFOR|SLEEP|BENCHMARK)/i,
       /(INFORMATION_SCHEMA|SYS\.|PG_)/i,
     ];
     if (patterns.some(p => p.test(String(val)))) {
       return "Potential SQL injection detected";
     }
     return true;
   });

2. XSS pattern detection:
   const noXSS = custom((val) => {
     const xssPatterns = [
       /<script/i,
       /on\w+\s*=/i,  // onclick, onerror, etc.
       /javascript:/i,
       /data:/i,
       /<iframe/i,
     ];
     if (xssPatterns.some(p => p.test(String(val)))) {
       return "Potential XSS payload detected";
     }
     return true;
   });

3. SSRF URL validation:
   const safeUrl = chain(
     string().url(),
     custom((url) => {
       const parsed = new URL(url);
       const blocked = [
         /^127\./,
         /^10\./,
         /^192\.168\./,
         /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
         /localhost/i,
         /169\.254\.169\.254/,  // AWS metadata
       ];
       if (blocked.some(p => p.test(parsed.hostname))) {
         return "SSRF: access to internal/blocked host blocked";
       }
       return true;
     })
   );

`,
  }),
  () => agent('Implement Rate Limiting on Validators', {
    label: 'validation-rate-limit',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Rate limiting for validation (DoS prevention):

1. Heavy validations (regex, async DB checks) can be expensive
2. Rate limit per IP/tenant for validation attempts
3. Implementation:
   - Validation middleware tracks: attempts, last_reset, remaining
   - Redis key: validation_attempts:{ip}:{minute}
   - Limit: 1000 validations/minute per IP
   - Exceeded → reject with 429

4. Complexity limit:
   - Max schema depth: 10 levels
   - Max array length in schema: 100
   - Max validation time: 5s per request
   - Timeout → reject with 400

5. Cache validation results for repeated data:
   - Hash of input → cache validation result for 5min
   - Useful for repeated validations of same payload

`,
  }),
]);

phase('Integration with API');
const apiIntegration = await parallel([
  () => agent('Create Validation Middleware', {
    label: 'validation-middleware',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Validation middleware for API:

1. Body validation:
   app.post('/api/v1/users', validateBody(userSchema), handler)
   → validates req.body against schema
   → on error: 400 with { errors: [{ field, message }] }

2. Query validation:
   validateQuery(querySchema)
   Validates req.query (type coercion built-in)

3. Params validation:
   validateParams(paramsSchema)
   Validates req.params

4. Response validation (optional):
   validateResponse(responseSchema)
   Ensures API responses match contract

5. Middleware implementation:
   src/middleware/validation.ts
   function validate(schema, source) {
     return async (req, res, next) => {
       const data = req[source];
       const result = schema.validate(data);
       if (!result.success) {
         return res.status(400).json({ errors: result.errors });
       }
       req.validated = result.data;  // typed data
       next();
     };
   }

6. TypeScript support:
   Declare module to add .validate method to schemas
   Infer types from validated data

`,
  }),
  () => agent('Implement Form Validation Hooks', {
    label: 'form-hooks',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Form validation (React):

1. Shared schemas:
   // validation/schemas.ts
   export const loginSchema = object({
     email: string().email(),
     password: string().min(8),
   });

2. React hook:
   import { useForm } from 'react-hook-form';
   import { zodResolver } from '@hookform/resolvers/zod';

   function LoginForm() {
     const { register, handleSubmit, formState: { errors } } = useForm({
       resolver: zodResolver(loginSchema),
     });
     // errors.field contains validation errors
   }

3. Client-side validation:
   - Real-time validation on blur/change
   - Submit-time full validation
   - Error display linked to fields

4. Server sync:
   - Server validates again (source of truth)
   - Client errors shown for UX, server overrides

5. i18n:
   - Error messages translatable
   - Support for custom messages per field

`,
  }),
]);

phase('Testing & Documentation');
const testing = await parallel([
  () => agent('Test Validation Library', {
    label: 'validation-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Validation library tests:

1. Unit tests:
   - Each validator: valid inputs pass, invalid fail
   - Nested object validation
   - Array validation (min/max length, items)
   - Union types
   - Optional fields

2. Edge cases:
   - null, undefined handling
   - Type coercion: "123" → 123
   - Empty strings, whitespace
   - Very long inputs (1MB string)
   - Circular references in objects

3. Security tests:
   - SQL injection patterns detected
   - XSS payloads caught
   - SSRF URLs blocked
   - Path traversal blocked

4. Performance:
   - Validate 1KB JSON in <1ms
   - 1000 validations/sec throughput

5. Integration:
   - Middleware correctly populates req.validated
   - Error responses have correct format

`,
  }),
  () => agent('Create Validation Documentation', {
    label: 'validation-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Validation library documentation:

1. API reference:
   - Schema builders: object, array, string, number, etc.
   - Validators: min, max, email, url, uuid, regex
   - Methods: .validate(), .parse(), .safeParse()
   - Type inference: z.infer<typeof schema>

2. Guides:
   - Getting started: first schema
   - Common patterns: login, registration, API requests
   - Custom validators: how to write
   - Security best practices
   - Performance tips

3. Examples:
   - User registration schema
   - API request validation
   - Form validation with React
   - Database model validation

4. Migration from other libraries (Zod/Yup/Joi)

5. Security considerations:
   - Never trust client-side validation alone
   - Rate limit expensive validations
   - Keep error messages generic in production

File: docs/validation-library.md

`,
  }),
  () => agent('Input Validation Library Sign-off', {
    label: 'validation-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Input Validation Library.

Review:
✅ Schema validation engine
✅ Common validators (string, number, date, enum)
✅ Sanitization (trim, escape, normalize)
✅ Security validators (SQLi, XSS, SSRF)
✅ Type coercion
✅ API middleware integration
✅ React form hooks
✅ Comprehensive tests
✅ Documentation complete
✅ Performance validated

Decision: INPUT VALIDATION LIBRARY PRODUCTION READY.

`,
  }),
]);

log('Input Validation Library workflow launched');