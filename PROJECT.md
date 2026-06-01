# Project: Content Personalization & A/B Testing Framework

## Architecture
The framework extends the existing Algo-Trader RaaS dashboard to support multi-tenant layout customization and A/B test variant assignment.
1. **Personalization Engine (Backend)**: Served via REST endpoints under `/api/personalization/config`. Determines dashboard Widget configurations and feature flags based on the user's plan tier (FREE, PRO, ENTERPRISE).
2. **A/B Config Splitter (Backend)**: Deterministically maps a `tenantId` to a test variant (A or B) via `/api/personalization/ab-config` to ensure consistent user experience per tenant.
3. **Analytics Event Collector (Backend)**: REST endpoint `/api/personalization/events` receives client interaction events (clicks, durations, page loads) and saves them securely in tenant-isolated JSON files (`data/personalization/events_{tenantId}.json`) to prevent cross-tenant data leaks.
4. **Client-Side A/B Test Store (Frontend)**: Zustand store (`ab-test-store.ts`) that manages user test groups and queues/sends analytics events to the backend.
5. **Dynamic Bento Grid Layout (Frontend)**: Renders the dashboard page (`dashboard-page.tsx`) dynamically based on the Bento configurations retrieved from the Personalization Engine.

## Code Layout
- `src/api/routes/personalization-routes.ts`: Backend REST router for personalization, A/B config split, and analytics events.
- `dashboard/src/stores/ab-test-store.ts`: Client-side Zustand store for variant assignment and event tracking.
- `dashboard/src/pages/dashboard-page.tsx`: Dynamically customizable Bento Grid layout dashboard.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Personalization & A/B APIs | Create `personalization-routes.ts`, register in `server.ts`, write variant splitting logic and tenant-isolated event storage. | None | PLANNED |
| M2 | Client Zustand Store & Tracking | Create `ab-test-store.ts`, implement A/B variant fetching, event dispatching, and buffering. | M1 | PLANNED |
| M3 | Dynamic Layout & Bento Grid Polish | Refactor `dashboard-page.tsx` to read dynamic widgets, apply personalization, and attach event tracking. | M2 | PLANNED |
| M4 | Verification & Forensic Audit | Run integration tests verifying 100% pass, no cross-tenant leakage, and verify p95 latency. | M3 | PLANNED |

## Interface Contracts
### Personalization Config Endpoint
- `GET /api/personalization/config?tier=<FREE|PRO|ENTERPRISE>`
- Response:
  ```json
  {
    "widgets": [
      { "id": "price-ticker", "colSpan": 12, "visible": true },
      { "id": "candlestick", "colSpan": 8, "visible": true },
      { "id": "strategy-controls", "colSpan": 4, "visible": true }
    ],
    "features": {
      "aiInsights": boolean,
      "unlimitedStrategies": boolean,
      "customAlerts": boolean
    }
  }
  ```

### A/B Config Endpoint
- `GET /api/personalization/ab-config?tenantId=<tenantId>`
- Response:
  ```json
  {
    "tenantId": "string",
    "variant": "A" | "B",
    "config": {
      "theme": "default" | "cyberpunk",
      "promoBanner": boolean,
      "abTestingEnabled": true
    }
  }
  ```

### Analytics Event Endpoint
- `POST /api/personalization/events`
- Request Body:
  ```json
  {
    "tenantId": "string",
    "eventType": "string",
    "eventData": object
  }
  ```
- Response: `201 Created` or `204 No Content`
