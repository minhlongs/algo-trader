# Phase 3: Enhanced Reporting API

**Priority**: P1 - Core Feature  
**Status**: Not Started  
**Effort**: 2 days  
**Dependencies**: Phase 2 (real-time tracking) complete

---

## Context Links

- **Plan**: `plans/260621-1618-affiliate-api-enhancements/plan.md`
- **Existing endpoints**: `src/api/routes/referral-routes.ts` (`/stats`, `/commissions`, `/payouts`)
- **Repository**: `src/referral/referral-repository.ts` (query methods)
- **Schema**: `src/db/schema.sql` (referral tables)

---

## Overview

Extend the reporting API with advanced filtering, aggregations, and export capabilities. Current endpoints provide basic stats and commission lists. Partners need date-range queries, time-series aggregations (daily/weekly/monthly earnings), CSV/JSON exports, and breakdowns by device/geography to analyze performance.

---

## Key Insights

- **Date range**: Most requested feature. Partners want "show me June earnings" or "last 30 days conversions".
- **Aggregations**: Time-series (daily revenue, cumulative earnings) enables trend analysis.
- **Exports**: CSV for Excel, JSON for API integration with partner's BI tools.
- **Breakdowns**: Device type, browser, country from `referral_tracking.metadata` and IP geolocation.
- **Performance**: Large datasets (100k+ clicks) require indexed queries and streaming exports.
- **Caching**: Frequently requested reports (last 7 days) can be cached in Redis (5-min TTL).

---

## Requirements

### Functional

**New endpoints** under `/api/v1/referral/reports`:

1. `GET /conversions`
   - Query: `?start=2025-06-01&end=2025-06-30&referralCode=XXXX`
   - Response: list of conversions (tenant_id, conversion_date, revenue, commission)
   - Pagination: 100 per page

2. `GET /earnings`
   - Query: `?granularity=day|week|month&start=...&end=...`
   - Response: time-series array `[{ period: '2025-06-01', earnings: 1234.56, conversions: 12 }]`
   - Cumulative toggle: `?cumulative=true` adds running total

3. `GET /export/csv`
   - Query: `?type=commissions|clicks|conversions&start=...&end=...`
   - Response: streaming CSV with `Content-Disposition: attachment`
   - Max 1 year data; >10k rows require `?token=` for re-auth

4. `GET /export/json`
   - Same as CSV but JSON Lines format (one object per line)

5. `GET /performance`
   - Query: `?metric=epc|conversion_rate|click_through_rate`
   - Response: `{ current: 12.34, previous: 10.12, change_percent: 21.8 }`
   - EPC = earnings per click (total_earnings / total_clicks)

6. `GET /geographic`
   - Response: `[{ country: 'US', clicks: 1200, conversions: 48, revenue: 15000 }]`
   - Derived from IP geolocation (store country in `referral_tracking.metadata`)

7. `GET /devices`
   - Response: `[{ device_type: 'desktop', clicks: 800, conversions: 32, rate: 4.0 }]`

### Non-Functional

- Date validation: `start <= end`, max range 1 year, dates not in future
- Indexing: All queries use existing indexes on `clicked_at`, `converted_at`, `referral_code`
- Streaming: CSV exports use `fastify/csv` or Node.js `stream.Writable` to avoid OOM
- Rate limiting: 60 RPM per tenant (reporting is DB-heavy)
- Caching: Redis cache for common reports (last 7 days, no filters) - 5 min TTL
- Response time p95: < 500ms for filtered queries (100k rows), < 2s for exports

---

## Architecture

### Query Examples

**Conversations by date range**:
```sql
SELECT
  DATE(converted_at) as conversion_date,
  COUNT(*) as conversions,
  SUM(revenue_generated) as revenue,
  SUM(commission_calculated) as commission
FROM referral_tracking t
JOIN referral_codes c ON t.referral_code = c.code
WHERE c.tenant_id = $1
  AND converted_at BETWEEN $2 AND $3
  AND converted_tenant_id IS NOT NULL
GROUP BY DATE(converted_at)
ORDER BY conversion_date DESC;
```

**Time-series earnings**:
```sql
SELECT
  DATE_TRUNC('day', t.converted_at) as period,
  SUM(t.commission_calculated) as earnings,
  COUNT(*) as conversions
FROM referral_tracking t
JOIN referral_codes c ON t.referral_code = c.code
WHERE c.tenant_id = $1
  AND t.converted_at BETWEEN $1 AND $2
GROUP BY period
ORDER BY period DESC;
```

**Geographic breakdown**:
```sql
SELECT
  metadata->>'country' as country,
  COUNT(*) as clicks,
  COUNT(converted_tenant_id) as conversions
FROM referral_tracking t
JOIN referral_codes c ON t.referral_code = c.code
WHERE c.tenant_id = $1
  AND metadata ? 'country'
GROUP BY country
ORDER BY clicks DESC;
```

### Caching Strategy

```typescript
const CACHE_TTL = 5 * 60; // 5 minutes

async function getCachedReport(key: string, ttl: number, fn: () => Promise<any>) {
  const cached = await redis.get(`report:${key}`);
  if (cached) return JSON.parse(cached);
  
  const result = await fn();
  await redis.setex(`report:${key}`, ttl, JSON.stringify(result));
  return result;
}

// Usage:
const key = `conversions:${tenantId}:${start}:${end}:${referralCode || 'all'}`;
return getCachedReport(key, CACHE_TTL, async () => {
  return await referralRepository.getConversions(tenantId, { start, end, referralCode });
});
```

### Export Streaming

```typescript
// Using fastify/csv
import csv from 'fastify-csv';

fastify.get('/export/csv', {
  handler: async (req, reply) => {
    const { type, start, end } = req.query as any;
    const rows = await referralRepository.getExportData(type, start, end);
    
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="export-${type}-${Date.now()}.csv"`);
    
    return reply.sendStream(
      streamArrayAsCsv(rows, {
        headers: ['id', 'date', 'amount', ...],
      })
    );
  },
});
```

---

## Related Code Files

**To Modify**:
- `src/api/server.ts` - register new `/api/v1/referral/reports` router
- `src/referral/referral-repository.ts` - add query methods: `getConversions()`, `getEarningsTimeSeries()`, `getGeographicBreakdown()`, `getDeviceBreakdown()`
- `src/referral/reporting-service.ts` (new) - business logic for aggregations, caching

**To Create**:
- `src/api/routes/referral-reports-routes.ts` - new router with 7 endpoints
- `src/referral/reporting-service.ts` - service layer with caching
- `src/referral/export-generator.ts` - CSV/JSON streaming utilities
- `src/api/routes/__tests__/referral-reports.test.ts`
- `src/referral/__tests__/reporting-service.test.ts`

**Dashboard** (optional for this phase):
- Future: `dashboard/src/pages/affiliate-reports-page.tsx`

---

## Implementation Steps

1. **Add repository methods** to `ReferralRepository`:
   - `getConversions(tenantId, { start, end, referralCode?, limit, offset })`
   - `getEarningsTimeSeries(tenantId, { granularity, start, end, cumulative })`
   - `getGeographicBreakdown(tenantId, { start, end })`
   - `getDeviceBreakdown(tenantId, { start, end })`
   - `getExportData(type, start, end, tenantId)` - cursor-based large dataset

2. **Create `ReportingService`** (`src/referral/reporting-service.ts`):
   - Inject `ReferralRepository`, `redisClient`
   - Methods: `getConversions()`, `getEarnings()`, `getPerformanceMetrics()`, `generateExport()`
   - Internal caching via `getCachedReport()` helper
   - Validate date ranges (max 1 year)

3. **Create export utilities** (`src/referral/export-generator.ts`):
   - `streamCsv(rows, columns): PassThrough` - transforms rows to CSV lines
   - `streamJsonLines(rows): PassThrough` - NDJSON format
   - Handle backpressure properly

4. **Create routes file** (`src/api/routes/referral-reports-routes.ts`):
   - Setup router with all 7 endpoints
   - Zod schemas for query validation:
     ```typescript
     const dateRangeSchema = z.object({
       start: z.string().datetime().refine(d => d <= new Date()),
       end: z.string().datetime().refine(d => d >= start),
       referralCode: z.string().optional().max(32),
     });
     const granularitySchema = z.enum(['day', 'week', 'month']);
     const exportSchema = z.object({
       type: z.enum(['commissions', 'clicks', 'conversions']),
       start: z.string().datetime(),
       end: z.string().datetime(),
     });
     ```
   - Rate limiting: 60 RPM per tenant (use existing distributedRateLimiter)
   - Auth: `tenantAuthMiddleware` (existing)
   - Error handling: 400 for invalid dates, 403 for >1 year range, 500 for DB errors

5. **Implement CSV export endpoint**:
   ```typescript
   referralReportsRouter.get('/export/csv', async (req, res) => {
     const { type, start, end } = exportSchema.parse(req.query);
     const tenantId = req.tenantId;
     
     // For large exports, require re-auth (optional for now)
     if (/* > 100k rows estimated */) {
       // Could require fresh API key header
     }
     
     const stream = reportingService.generateCsvExport(type, { tenantId, start, end });
     res.header('Content-Type', 'text/csv');
     res.header('Content-Disposition', `attachment; filename="referral-${type}-${Date.now()}.csv"`);
     stream.pipe(res);
   });
   ```

6. **Register router** in `src/api/server.ts`:
   ```typescript
   import { referralReportsRouter } from './routes/referral-reports-routes';
   // ...
   this.app.use('/api/v1/referral/reports', referralAuthMiddleware, referralReportsRouter);
   ```

7. **Write unit tests**:
   - Repository queries: test date filtering, grouping, empty results
   - ReportingService: test caching (Redis hit/miss), date validation errors
   - Export generator: test CSV headers, JSON Lines format, special character escaping
   - Routes: test all endpoints with valid/invalid queries, auth failures

8. **Write integration tests**:
   - Seed DB with 1000 clicks/conversions spanning multiple months
   - Test `GET /conversions?start=...&end=...` returns correct date range
   - Test `GET /earnings?granularity=week` aggregates correctly
   - Test CSV export: stream 10k rows, verify headers, no OOM
   - Test geographic breakdown: IPs with/without country metadata

9. **Performance tuning**:
   - Add DB indexes if queries slow:
     ```sql
     CREATE INDEX idx_referral_tracking_converted_tenant_date ON referral_tracking(converted_tenant_id, converted_at);
     CREATE INDEX idx_referral_tracking_metadata_gin ON referral_tracking USING GIN(metadata);
     ```
   - Benchmark: 100k rows query should be < 300ms with indexes

10. **Update API docs**: Document all new endpoints with examples

11. **Deploy to staging**: Load test with 1M click dataset

---

## Todo List

- [ ] Add DB indexes for reporting queries (if needed)
- [ ] Implement `ReferralRepository.getConversions()`
- [ ] Implement `ReferralRepository.getEarningsTimeSeries()`
- [ ] Implement `ReferralRepository.getGeographicBreakdown()`
- [ ] Implement `ReferralRepository.getDeviceBreakdown()`
- [ ] Implement `ReferralRepository.getExportData()` (cursor-based)
- [ ] Create `ReportingService` with Redis caching
- [ ] Create export generator (CSV, JSON Lines)
- [ ] Create `referral-reports-routes.ts` with 7 endpoints
- [ ] Add Zod schemas for date ranges, granularity, export params
- [ ] Register routes in `server.ts`
- [ ] Write unit tests (≥ 90% coverage)
- [ ] Write integration tests (full data flow)
- [ ] Benchmark queries; add indexes if p95 > 300ms
- [ ] Run typecheck (0 errors)
- [ ] Deploy to staging; verify with large dataset
- [ ] Update API docs

---

## Success Criteria

- **Date filtering**: All endpoints support `start`/`end` query params; max 1 year range enforced
- **Aggregations**: Time-series earnings correctly grouped by day/week/month
- **Exports**: CSV/JSON streaming for 100k+ rows without OOM; downloads complete < 10s
- **Performance**: p95 < 500ms for filtered queries (100k rows)
- **Caching**: Repeated requests for same report hit Redis (5-min TTL)
- **Breakdowns**: Geographic and device breakdowns from stored metadata
- **Tests**: Unit ≥90%, integration 100%

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Large export causes OOM | Medium | High | Use streaming (never load all rows in memory); limit max rows |
| Slow queries on 1M+ rows | Medium | Medium | Add composite indexes; materialized views for frequent aggregates |
| Date range abuse (10 years) | Low | Medium | Enforce max 1 year; return 400 if exceeded |
| Cache stampede (cold cache + 100 requests) | Low | Low | Use redis SETNX with random TTL jitter |
| IP geolocation missing | High | Low | Store NULL country; show "Unknown" in reports |

---

## Security Considerations

- **Auth required**: All endpoints use `tenantAuthMiddleware`
- **Data isolation**: All queries filter by `tenantId` (from req.tenantId)
- **Rate limiting**: 60 RPM per tenant (DB-heavy operations)
- **Export size limits**: Max 1 year per request; optionally require re-auth for >100k rows
- **No PII**: Exports exclude IP addresses, user agents (aggregated only)
- **Audit log**: Log all export requests (tenantId, type, row count)

---

## Next Steps

After Phase 3:
1. Phase 4: Dedicated affiliate API keys (allows partners to access API without main tenant credentials)
2. Phase 5: Enhanced fraud detection (improves data quality)
3. Phase 6: Testing & monitoring (load test reporting endpoints)

---

**Phase Status**: Not Started  
**Blockers**: Phase 2 completion (real-time tracking)  
**Next**: Begin implementation after Phase 2 tests pass
