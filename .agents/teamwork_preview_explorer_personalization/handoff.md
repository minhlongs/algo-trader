# Handoff Report — Content Personalization & A/B Testing Framework

This report hands off the technical analysis and structured implementation strategy to the Implementer agent.

---

## 1. Observation

Direct observations made within the codebase:

1. **Express Server Route Registry**:
   - Location: `src/api/server.ts`
   - Registry block (lines 137–175):
     ```typescript
     this.app.use('/api/trades', tradesRouter);
     this.app.use('/api/pnl', pnlRouter);
     ...
     this.app.use('/api/analytics', analyticsRouter);
     ```
2. **Existing Analytics Events Storage File**:
   - Location: `src/api/routes/analytics-routes.ts`
   - Config (lines 17–18):
     ```typescript
     const DATA_DIR = join(process.cwd(), 'data', 'analytics');
     const EVENTS_FILE = join(DATA_DIR, 'events.json');
     ```
3. **Zustand Authentication State**:
   - Location: `dashboard/src/stores/auth-store.ts`
   - Key attributes (lines 14–17):
     ```typescript
     tier: 'free' | 'pro' | 'enterprise';
     role: 'admin' | 'user';
     token: string | null;
     tenantId: string | null;
     ```
4. **Dashboard Bento Grid Layout**:
   - Location: `dashboard/src/pages/dashboard-page.tsx`
   - Key layout containers (lines 222–224):
     ```tsx
     {/* 12-Column Bento Grid Section */}
     <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
       {/* Widget 1: Real-Time Candlestick Chart (Col-span 8) */}
     ```
5. **Project Test Runner**:
   - Run Command: `pnpm test`
   - State: 1508 tests passing.

---

## 2. Logic Chain

1. **Backend Integration**: To expose config and receive tracking events without modifying existing logic, we must write a modular Express router (`src/api/routes/personalization-routes.ts`) and mount it within `server.ts` adjacent to existing route definitions.
2. **Deterministic A/B Split**: Rather than persist variant state per-user in PostgreSQL or Redis (which increases query overhead and p95 latency), we can compute it deterministically using `sha256(tenantId) % 2 === 0` to yield `A` or `B`. This ensures stateless fast calculation.
3. **Data Security (Anti-LFI)**: When saving events to `events_{tenantId}.json`, we must avoid directory traversal risks by forcing a regex block `/^[a-zA-Z0-9_-]+$/` on `tenantId`.
4. **Dynamic Grid Rendering**: Refactoring the static grid to a registry map (`widgetRegistry`) and mapping widget `colSpan` dynamically allows clean, component-safe layout updates without bloating the component tree.
5. **Interaction Buffering**: Running `trackEvent` will append the events to a Zustand-managed queue (`eventQueue`) that persists to localStorage, ensuring that tracking continues even if connectivity is temporarily dropped, automatically flushing when online.

---

## 3. Caveats

- **Tailwind Dynamic Classes**: Tailwind CLI builds CSS based on static text analysis. We must fully map `lg:col-span-*` classes (e.g. `colSpanMap`) instead of generating them dynamically via template strings like ``lg:col-span-${colSpan}``, otherwise Tailwind will fail to output the compiled style rules.
- **FS Race Conditions**: Synchronous writes with `writeFileSync` are simple and sufficient for initial testing, but high-volume multi-user setups should eventually utilize async queuing or SQLite to avoid write-locks.

---

## 4. Conclusion

The design is fully prepared. It is decoupled, performs all calculations in-memory to ensure <150ms p95 latency, enforces strict separation of tenant event files, and provides resilient client-side Zustand state tracking.

---

## 5. Verification Method

To verify the implementation once written:

1. **API Contracts Integration Tests**:
   Create `src/api/routes/__tests__/personalization-routes.test.ts` and verify:
   - `GET /api/personalization/config?tier=PRO` returns correct widgets and features.
   - `GET /api/personalization/ab-config?tenantId=tenant-1` returns a variant deterministically.
   - `POST /api/personalization/events` writes events in clean files.
   - Malicious path traversal payloads are rejected with a `400` status.
   - Run tests:
     ```bash
     pnpm vitest run src/api/routes/__tests__/personalization-routes.test.ts
     ```
2. **Frontend Compilability**:
   Build the dashboard client:
   ```bash
   pnpm run dashboard:build
   ```

---

## 6. Remaining Work

Here is the step-by-step implementation strategy for the Implementer:

### Phase 1: Backend Routes
- [ ] Create `src/api/routes/personalization-routes.ts` with the proposed GET and POST endpoints.
- [ ] Register `personalizationRouter` in `src/api/server.ts`.
- [ ] Mount `/api/personalization` endpoint.
- [ ] Create integration tests in `src/api/routes/__tests__/personalization-routes.test.ts` to assert outputs and check directory traversal prevention.

### Phase 2: Zustand Store
- [ ] Create `dashboard/src/stores/ab-test-store.ts` implementing the state variables and persistence middleware.
- [ ] Verify `apiClient` requests to backend endpoints.

### Phase 3: Bento Grid Layout
- [ ] Integrate `useAbTestStore` hook in `dashboard/src/pages/dashboard-page.tsx`.
- [ ] Create `widgetRegistry` and mapping maps to display widgets dynamically based on the configuration.
- [ ] Attach `trackEvent` triggers on mounts/unmounts, control Switch toggles, and premium feature banner clicks.
- [ ] Implement Cyberpunk conditional design class hooks.
