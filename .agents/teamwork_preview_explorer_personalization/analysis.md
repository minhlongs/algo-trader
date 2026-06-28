# Content Personalization & A/B Testing Framework Analysis

This report documents the architectural design, API contracts, and implementation plan for the **Content Personalization & A/B Testing Framework** in the Algo-Trader RaaS Dashboard.

---

## 1. Backend REST Endpoints & Routing

The Express backend registers routes in `src/api/server.ts`. A new route file, `src/api/routes/personalization-routes.ts`, will be created and mounted under `/api/personalization` in the Express server.

### A. Route Registration in `src/api/server.ts`
- **Import statement**:
  ```typescript
  import { personalizationRouter } from './routes/personalization-routes';
  ```
- **Mount location**: Mount under `/api/personalization` (adjacent to other `/api` routes) in `setupRoutes()`:
  ```typescript
  this.app.use('/api/personalization', personalizationRouter);
  ```

### B. Personalization Router Implementation
A robust implementation of `src/api/routes/personalization-routes.ts` requires:
- Safe filesystem writes with input validation to prevent security leaks.
- Clear separation of dynamic widget configurations based on client tiers.
- A deterministic A/B testing allocator based on `tenantId`.

Below is the design spec for `/src/api/routes/personalization-routes.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { logger } from '../../utils/logger';

const DATA_DIR = join(process.cwd(), 'data', 'personalization');

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Regex validation for tenantId to block directory traversal attacks (LFI)
const TENANT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export const personalizationRouter = Router();

/**
 * GET /api/personalization/config?tier=FREE|PRO|ENTERPRISE
 * Returns widget layout structures and active feature flags.
 */
personalizationRouter.get('/config', (req: Request, res: Response) => {
  const tier = (req.query.tier as string || 'FREE').toUpperCase();
  
  if (tier !== 'FREE' && tier !== 'PRO' && tier !== 'ENTERPRISE') {
    res.status(400).json({ error: 'Invalid tier parameter' });
    return;
  }

  let widgets = [];
  const features = {
    aiInsights: false,
    unlimitedStrategies: false,
    customAlerts: false,
  };

  if (tier === 'FREE') {
    widgets = [
      { id: 'price-ticker', colSpan: 12, visible: true },
      { id: 'candlestick', colSpan: 12, visible: true },
      { id: 'strategy-controls', colSpan: 12, visible: false },
      { id: 'pnl-analytics', colSpan: 12, visible: true },
      { id: 'active-positions', colSpan: 12, visible: true },
      { id: 'system-logs', colSpan: 12, visible: false },
    ];
  } else if (tier === 'PRO') {
    widgets = [
      { id: 'price-ticker', colSpan: 12, visible: true },
      { id: 'candlestick', colSpan: 8, visible: true },
      { id: 'strategy-controls', colSpan: 4, visible: true },
      { id: 'pnl-analytics', colSpan: 12, visible: true },
      { id: 'active-positions', colSpan: 6, visible: true },
      { id: 'system-logs', colSpan: 6, visible: true },
    ];
    features.aiInsights = true;
    features.customAlerts = true;
  } else if (tier === 'ENTERPRISE') {
    widgets = [
      { id: 'price-ticker', colSpan: 12, visible: true },
      { id: 'candlestick', colSpan: 8, visible: true },
      { id: 'strategy-controls', colSpan: 4, visible: true },
      { id: 'pnl-analytics', colSpan: 12, visible: true },
      { id: 'active-positions', colSpan: 6, visible: true },
      { id: 'system-logs', colSpan: 6, visible: true },
      { id: 'ai-insights-panel', colSpan: 12, visible: true },
    ];
    features.aiInsights = true;
    features.unlimitedStrategies = true;
    features.customAlerts = true;
  }

  res.json({ widgets, features });
});

/**
 * GET /api/personalization/ab-config?tenantId=<tenantId>
 * Deterministically splits tenant users into A/B variants to ensure consistent UI experiences.
 */
personalizationRouter.get('/ab-config', (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string;

  if (!tenantId || !TENANT_ID_REGEX.test(tenantId)) {
    res.status(400).json({ error: 'Missing or invalid tenantId' });
    return;
  }

  // Deterministic hashing via SHA-256
  const hash = crypto.createHash('sha256').update(tenantId).digest('hex');
  const lastChar = hash.slice(-1);
  const variant = parseInt(lastChar, 16) % 2 === 0 ? 'A' : 'B';

  const config = {
    theme: variant === 'A' ? 'default' : 'cyberpunk',
    promoBanner: variant === 'A' ? false : true,
    abTestingEnabled: true,
  };

  res.json({
    tenantId,
    variant,
    config,
  });
});

/**
 * POST /api/personalization/events
 * Collects client interactions and appends them to tenant-isolated storage files.
 */
personalizationRouter.post('/events', (req: Request, res: Response) => {
  try {
    const { tenantId, eventType, eventData } = req.body;

    if (!tenantId || !TENANT_ID_REGEX.test(tenantId)) {
      res.status(400).json({ error: 'Missing or invalid tenantId' });
      return;
    }

    if (!eventType) {
      res.status(400).json({ error: 'Missing eventType' });
      return;
    }

    ensureDir();
    const eventFile = join(DATA_DIR, `events_${tenantId}.json`);

    let events = [];
    if (existsSync(eventFile)) {
      try {
        events = JSON.parse(readFileSync(eventFile, 'utf-8'));
      } catch (err) {
        logger.error(`[Personalization] Failed to parse events for tenant ${tenantId}:`, err);
        events = [];
      }
    }

    const newEvent = {
      eventType,
      eventData: eventData || {},
      timestamp: new Date().toISOString(),
    };

    events.push(newEvent);

    // Atomic/Safe disk write
    writeFileSync(eventFile, JSON.stringify(events, null, 2));

    logger.debug(`[Personalization] Event '${eventType}' registered for tenant ${tenantId}`);
    res.status(201).json({ success: true, event: newEvent });
  } catch (err) {
    logger.error('[Personalization] Failed to ingest event:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
```

---

## 2. Client-Side Zustand Store Design

The client-side Zustand store will live in `dashboard/src/stores/ab-test-store.ts`. It manages:
- Retrieval and storage of A/B split configuration.
- Retrieval and storage of widget personalization parameters.
- Offline queuing and transmission of analytics events to the backend.

### A. Interface Definitions
```typescript
export interface AbConfig {
  theme: 'default' | 'cyberpunk';
  promoBanner: boolean;
  abTestingEnabled: boolean;
}

export interface PersonalizationWidget {
  id: string;
  colSpan: number;
  visible: boolean;
}

export interface PersonalizationFeatures {
  aiInsights: boolean;
  unlimitedStrategies: boolean;
  customAlerts: boolean;
}

export interface AnalyticsEvent {
  tenantId: string;
  eventType: string;
  eventData: Record<string, any>;
  timestamp?: string;
}

export interface AbTestStore {
  variant: 'A' | 'B' | null;
  config: AbConfig | null;
  widgets: PersonalizationWidget[];
  features: PersonalizationFeatures;
  eventQueue: AnalyticsEvent[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchAbConfig: (tenantId: string) => Promise<void>;
  fetchPersonalizationConfig: (tier: string) => Promise<void>;
  trackEvent: (eventType: string, eventData?: Record<string, any>) => Promise<void>;
  flushEvents: () => Promise<void>;
  reset: () => void;
}
```

### B. Implementation Plan (`dashboard/src/stores/ab-test-store.ts`)
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../lib/api-client';
import { useAuthStore } from './auth-store';

const DEFAULT_FEATURES: PersonalizationFeatures = {
  aiInsights: false,
  unlimitedStrategies: false,
  customAlerts: false,
};

export const useAbTestStore = create<AbTestStore>()(
  persist(
    (set, get) => ({
      // State
      variant: null,
      config: null,
      widgets: [],
      features: DEFAULT_FEATURES,
      eventQueue: [],
      loading: false,
      error: null,

      // Fetch A/B variant assignment
      fetchAbConfig: async (tenantId: string) => {
        set({ loading: true, error: null });
        try {
          const res = await apiClient.get<{
            variant: 'A' | 'B';
            config: AbConfig;
          }>(`/personalization/ab-config?tenantId=${tenantId}`);
          
          set({
            variant: res.variant,
            config: res.config,
            loading: false,
          });
        } catch (err: any) {
          set({
            error: err.message || 'Failed to fetch A/B configuration',
            loading: false,
          });
        }
      },

      // Fetch feature flag overrides & layouts
      fetchPersonalizationConfig: async (tier: string) => {
        set({ loading: true, error: null });
        try {
          const res = await apiClient.get<{
            widgets: PersonalizationWidget[];
            features: PersonalizationFeatures;
          }>(`/personalization/config?tier=${tier}`);
          
          set({
            widgets: res.widgets,
            features: res.features,
            loading: false,
          });
        } catch (err: any) {
          set({
            error: err.message || 'Failed to fetch personalization config',
            loading: false,
          });
        }
      },

      // Buffers/sends tracking event
      trackEvent: async (eventType: string, eventData: Record<string, any> = {}) => {
        const tenantId = useAuthStore.getState().tenantId || 'anonymous';
        const variant = get().variant || 'UNKNOWN';

        const eventPayload: AnalyticsEvent = {
          tenantId,
          eventType,
          eventData: {
            ...eventData,
            variant,
            theme: get().config?.theme || 'default',
          },
        };

        // Queue event
        set((state) => ({
          eventQueue: [...state.eventQueue, eventPayload],
        }));

        // Flush immediately
        await get().flushEvents();
      },

      // Empty buffered events queue
      flushEvents: async () => {
        const { eventQueue } = get();
        if (eventQueue.length === 0) return;

        const remaining: AnalyticsEvent[] = [];

        for (const event of eventQueue) {
          try {
            await apiClient.post('/personalization/events', event);
          } catch (err) {
            console.warn('[AB Store] Event dispatch failed. Retaining event in queue.', err);
            remaining.push(event);
          }
        }

        set({ eventQueue: remaining });
      },

      reset: () => {
        set({
          variant: null,
          config: null,
          widgets: [],
          features: DEFAULT_FEATURES,
          eventQueue: [],
          error: null,
        });
      },
    }),
    {
      name: 'cashclaw-ab-test',
      partialize: (state) => ({
        variant: state.variant,
        config: state.config,
        widgets: state.widgets,
        features: state.features,
        eventQueue: state.eventQueue,
      }),
    }
  )
);
```

---

## 3. Dynamic Bento Grid Dashboard Page Refactoring

### A. Mounting Configuration & Lifecycle
Refactor `dashboard/src/pages/dashboard-page.tsx` to mount personalization settings when the user signs in:
```typescript
import { useAuthStore } from '../stores/auth-store';
import { useAbTestStore } from '../stores/ab-test-store';

// Inside DashboardPage component:
const { tier, tenantId } = useAuthStore();
const {
  variant,
  config,
  widgets,
  features,
  fetchAbConfig,
  fetchPersonalizationConfig,
  trackEvent,
} = useAbTestStore();

// Track overall session time
useEffect(() => {
  if (tenantId) fetchAbConfig(tenantId);
  if (tier) fetchPersonalizationConfig(tier);

  trackEvent('dashboard_page_load');

  const startTime = Date.now();
  return () => {
    const durationSec = Math.floor((Date.now() - startTime) / 1000);
    trackEvent('dashboard_session_close', { durationSeconds: durationSec });
  };
}, [tenantId, tier]);
```

### B. Widget Render Registry Map
To dynamicize layout configurations, declare a mapping layer:
```typescript
const colSpanMap: Record<number, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12',
};

const widgetRegistry: Record<string, (colSpan: number) => React.ReactNode> = {
  'candlestick': (colSpan) => (
    <Card 
      key="candlestick" 
      className={`${colSpanMap[colSpan] || 'lg:col-span-8'} flex flex-col h-[450px]`}
      onClickCapture={() => trackEvent('widget_click', { widget: 'candlestick' })}
    >
      <CandlestickChart />
    </Card>
  ),
  'strategy-controls': (colSpan) => (
    <Card 
      key="strategy-controls" 
      className={`${colSpanMap[colSpan] || 'lg:col-span-4'} flex flex-col justify-between h-[450px]`}
      onClickCapture={() => trackEvent('widget_click', { widget: 'strategy-controls' })}
    >
      <div className="space-y-4 flex-grow overflow-y-auto scrollbar-thin pr-1">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <span className="text-white text-sm font-semibold">Strategies & Controls</span>
          <span className="text-xs text-muted font-mono">{activeStrategies} active</span>
        </div>
        <StrategyStatusPanel strategies={strategies} botStatus={botStatus} />
      </div>

      <div className="border-t border-white/5 pt-4 mt-4">
        <h4 className="text-xs text-muted uppercase font-bold tracking-wider mb-2">Emergency Switch</h4>
        <AdminControls
          status={adminStatus}
          halt={() => {
            halt();
            trackEvent('emergency_switch_trigger', { action: 'halt' });
          }}
          resume={() => {
            resume();
            trackEvent('emergency_switch_trigger', { action: 'resume' });
          }}
          loading={adminLoading}
          error={adminError}
          onRefresh={refreshAdmin}
        />
      </div>
    </Card>
  ),
  'pnl-analytics': (colSpan) => (
    <Card 
      key="pnl-analytics" 
      className={`${colSpanMap[colSpan] || 'lg:col-span-12'} grid grid-cols-1 xl:grid-cols-2 gap-6`}
      onClickCapture={() => trackEvent('widget_click', { widget: 'pnl-analytics' })}
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-3.5 bg-accent rounded-full" />
          <h3 className="text-white text-sm font-semibold">PnL Analytics</h3>
        </div>
        <PnLAnalyticsChart metrics={metrics} loading={pnlLoading} error={pnlError} />
      </div>
      <div className="flex flex-col justify-between">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-3.5 bg-accent rounded-full" />
          <h3 className="text-white text-sm font-semibold">Equity Curve</h3>
        </div>
        <div className="bg-[#101426] border border-white/5 rounded-xl p-4 flex-grow flex items-center justify-center">
          <EquityCurveChart positions={positions} />
        </div>
      </div>
    </Card>
  ),
  'active-positions': (colSpan) => (
    <Card 
      key="active-positions" 
      className={`${colSpanMap[colSpan] || 'lg:col-span-6'} flex flex-col h-[430px]`}
      onClickCapture={() => trackEvent('widget_click', { widget: 'active-positions' })}
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
        <span className="text-white text-sm font-semibold">Active Positions</span>
        <span className="text-xs text-muted font-mono">{openCount} open</span>
      </div>
      <div className="flex-grow overflow-y-auto scrollbar-thin">
        <PositionsTableSortable positions={positions} />
      </div>
    </Card>
  ),
  'system-logs': (colSpan) => (
    <Card 
      key="system-logs" 
      className={`${colSpanMap[colSpan] || 'lg:col-span-6'} p-0 overflow-hidden`}
      onClickCapture={() => trackEvent('widget_click', { widget: 'system-logs' })}
    >
      <TerminalLogs />
    </Card>
  ),
  'ai-insights-panel': (colSpan) => (
    <Card 
      key="ai-insights-panel" 
      className={`${colSpanMap[colSpan] || 'lg:col-span-12'} p-6 flex flex-col`}
    >
      <h3 className="text-white text-sm font-semibold mb-2 flex items-center gap-2">
        <span className="text-accent">✨</span> AI Insights Engine
      </h3>
      <p className="text-muted text-xs">
        Swarm models are analyzing real-time spreads... Recommendations will appear here.
      </p>
    </Card>
  ),
};
```

### C. Bento Grid Markup
The markup structure simplifies to:
```tsx
{/* Dynamic Bento Grid Layout */}
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
  {widgets
    .filter((w) => w.visible && widgetRegistry[w.id])
    .map((w) => widgetRegistry[w.id](w.colSpan))}
</div>
```
*(Note: If `price-ticker` is configured as a widget, we can remove it from its static top placement and render it dynamically inside the grid structure, or render it optionally at the top if `widgets.find(w => w.id === 'price-ticker')?.visible !== false`)*.

### D. A/B Testing Cyberpunk Styling
If `config?.theme === 'cyberpunk'`, add the thematic class to the container:
```tsx
<div className={`space-y-6 ${config?.theme === 'cyberpunk' ? 'theme-cyberpunk font-mono' : ''}`}>
```
Corresponding theme definitions can be injected into the main styles, rendering neon borders and neon glows (e.g. replacing `border-white/5` with glowing pink/cyan neon borders).

### E. Promotional Upgrade Banner
If `config?.promoBanner` is active, display a premium-looking notification banner:
```tsx
{config?.promoBanner && (
  <div 
    className="bg-gradient-to-r from-accent/20 to-purple-500/20 border border-accent/40 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-3 cursor-pointer"
    onClick={() => trackEvent('upgrade_banner_click')}
  >
    <div>
      <h4 className="text-white text-sm font-semibold">⚡ Upgrade to Algo-Trader PRO</h4>
      <p className="text-muted text-xs">Unlock real-time strategy toggles, unlimited strategies, and advanced AI Insights!</p>
    </div>
    <button className="bg-accent hover:bg-accent/80 text-black font-semibold text-xs px-4 py-2 rounded-lg transition-colors">
      Upgrade Now
    </button>
  </div>
)}
```

---

## 4. Latency & Security Risk Mitigation

### A. Performance Optimization (P95 Latency < 150ms)
1. **Zero Database Queries**: The `/config` and `/ab-config` requests calculate their response configurations instantly in-memory without blocking database queries.
2. **Minimal File writes**: File writes for POST `/events` append events locally. Write operations are guarded. In high-traffic scenarios, standard I/O calls can be optimized by batching writes or saving memory logs.

### B. Security / Cross-Tenant Leakage Prevention
1. **Rigid Path Sanitization**: Before loading or saving events to `events_{tenantId}.json`, the `tenantId` parameter is strictly validated against `TENANT_ID_REGEX` (`/^[a-zA-Z0-9_-]+$/`). Any string containing traversal sequences (e.g., `../`, `/`) is instantly rejected with `400 Bad Request`.
2. **Deterministic Isolation**: Files are named uniquely per tenant and reside strictly within `data/personalization/`, locking tenant boundaries completely.
