# Performance Analysis & Optimization Report — Real-Time Rendering for Algo-Trader RaaS Dashboard

This report provides a comprehensive analysis of the real-time rendering performance bottlenecks in the React/Vite dashboard of the Algo-Trader RaaS platform, specifically focusing on the candlestick chart, signals panel, price ticker strip, and main dashboard page. It proposes a series of optimizations to eliminate CPU-heavy drawing operations, redundant re-renders, and network duplication.

---

## Executive Summary

Our investigation revealed several critical design flaws and performance bottlenecks causing high CPU usage and UI lag under high transaction volumes:
1. **Redundant WebSocket Connections**: The dashboard establishes two concurrent WebSocket connections to the same server via `useWebSocketPriceFeed` and `useRealtimeUpdates`, duplicating incoming message processing and store dispatches.
2. **Global Timer render loop**: The `useNow()` hook in `DashboardPage` updates a time string every second, forcing the entire page and all its non-memoized children (including charts and tables) to re-render.
3. **Over-Subscription to Prices**: `CandlestickChart`, `PriceTickerStrip`, and `TerminalLogs` subscribe to the entire `prices` object. As a result, they re-render on *every price tick for any asset* in the system, even if the active pair is unchanged.
4. **Inefficient Chart Updates**:
   - `CandlestickChart` calls `setData()` with 200 elements on every single tick, completely rebuilding the chart data series.
   - `PriceChartLightweight` destroys and recreates the entire chart instance whenever `data` changes.
5. **WebSocket & UI Mismatch**: Real-time signal and PnL updates received via WebSockets are written to `useDashboardStore`, but the UI only reads from the polled REST APIs. The WebSocket-processed state goes completely unused while HTTP polling continues every 5 seconds.
6. **No Component Memoization**: Core presentation panels (`SignalsPanel`, `PositionsTableSortable`) do not use `React.memo` and calculate sorting algorithms directly in the render path.

---

## 1. Current Rendering Structure & Integrations

The current rendering layout relies on a top-level `DashboardPage` component that houses several sub-components:

```
[DashboardPage] (Re-renders every 1s via useNow() + store subscriptions)
  ├── useWebSocketPriceFeed() (WS Connection 1 -> useTradingStore)
  ├── useRealtimeUpdates()    (WS Connection 2 -> useTradingStore & useDashboardStore)
  ├── useSignals()            (HTTP Polling every 5s -> Local State)
  ├── usePnlAnalytics()       (HTTP Fetch on Mount -> Local State)
  │
  ├── [PriceTickerStrip]      (Subscribed to s.prices -> Re-renders on any price tick)
  ├── [StatsRow]              (Receives PnL metrics)
  ├── [CandlestickChart]      (Subscribed to s.prices -> Re-renders on any tick + calls setData())
  ├── [StrategyStatusPanel]  (Receives strategies)
  ├── [AdminControls]         (Receives admin status)
  ├── [PnLAnalyticsChart]     (Recharts-based, processes data on render)
  ├── [PositionsTableSortable](Receives positions, sorts in render)
  ├── [TerminalLogs]          (Subscribed to s.prices & s.trades -> Re-renders on any tick)
  ├── [SpreadOpportunities]   (Receives spreads, sorts in render)
  └── [SignalsPanel]          (Receives signals, sorts in render)
```

---

## 2. Key Performance Bottlenecks Under Stress

### A. Dual WebSocket Connections & Redundant Stores
`DashboardPage` loads both `useWebSocketPriceFeed` and `useRealtimeUpdates`. Both establish connections to the same endpoint and subscribe to channels in parallel. This causes twice the network bandwidth consumption, JSON parsing cost, and React state updates.

### B. The 1-Second Global Render Loop
`useNow()` updates a string state in `DashboardPage` every `1000ms`. Because of this hook, the React virtual DOM tree for the entire page is recalculated every second, invalidating caching benefits for all child components that are not memoized.

### C. Over-Subscribing to Large Zustand State
In `CandlestickChart` and `TerminalLogs`:
```typescript
const prices = useTradingStore((s) => s.prices);
```
Since `prices` changes when any symbol receives a tick, these components re-render continuously. Under a high connection volume with dozens of symbol pairs, this translates to hundreds of updates per second.

### D. Rebuilding the Chart Dataset on Every Tick
In `CandlestickChart`, when a tick comes, it calculates `setCandles(...)` and triggers:
```typescript
useEffect(() => {
  candleSeriesRef.current.setData(candles);
  volumeSeriesRef.current.setData(volumeData);
}, [candles]);
```
`setData` is an expensive call in `lightweight-charts` because it wipes out the current series and redraws it from scratch. Lightweight charts are designed to take incremental updates using `series.update()`.

### E. Destroying and Re-creating Chart Instances
`PriceChartLightweight` implements a `useEffect` hooked to `data`:
```typescript
useEffect(() => {
  const chart = createChart(container, ...);
  ...
  return () => {
    chart.remove();
  };
}, [data, height, color]);
```
This is a critical bug. Every time `data` updates, the canvas is destroyed and reconstructed.

---

## 3. Actionable Optimization Strategies

### Strategy 1: Unify WebSocket Connections & Optimally Buffer Updates
Consolidate `useWebSocketPriceFeed` and `useRealtimeUpdates` into a single hook `useDashboardWebSocket`.
- Use a single WebSocket connection.
- Increase the buffer window from `25ms` to `100ms` for price ticks.
- For snapshot-style messages (positions, spreads, pnl), instead of pushing every update to a buffer array, overwrite and save only the **latest** message to update. This fixes the type mismatch/nested array bug and reduces unnecessary store updates.

### Strategy 2: Remove Global Render Triggers
Extract the `lastUpdate` time display into a standalone, memoized sub-component `LastUpdatedLabel`. This isolates the `useNow` 1-second update trigger so that the main `DashboardPage` does not re-render.

### Strategy 3: Granular Zustand Selectors & Transient Subscriptions
- Use shallow equality selectors or specific selectors for specific keys:
  ```typescript
  const tick = useTradingStore((s) => s.prices[activePair]);
  ```
- For `TerminalLogs`, use **transient subscriptions** (`useTradingStore.subscribe`) to register a callback that pushes logs directly to the component state *without* triggering a component re-render on the store state change itself.

### Strategy 4: Direct Canvas Updates (OOB Updates)
Remove `candles` from React state. Load the initial history, call `setData()` once, and then use the active-tick subscription to call `candleSeries.update()` directly. The component will remain fully static inside React, while the charts update out-of-band at 60fps.

### Strategy 5: CSS-Based Flashing and Component Memoization
Instead of using `setTimeout` to update state to clear a ticker flash, use GPU-accelerated CSS animations (`@keyframes`) that fade out naturally. This avoids triggering React dispatches entirely.
Additionally, wrap `SignalsPanel`, `PositionsTableSortable`, and `PnLAnalyticsChart` in `React.memo` and memoize all callback parameters with `useCallback`.

### Strategy 6: Virtualized Lists for Tables
When rendering tables with many rows (e.g. `SignalsPanel` or `PositionsTableSortable`), render only the visible rows using a simple custom virtualizer or limit display to a `top-N` array.

---

## 4. Proposed Code Snippets & Updates

### A. Unifying the WebSocket Connection (`useDashboardWebSocket.ts`)
Create a single hook to replace both previous hooks. It handles buffering, overwriting snapshot updates, and updating both stores cleanly:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';
import { useTradingStore, PriceTick } from '../stores/trading-store';
import { useDashboardStore } from '../stores/dashboard-store';

export function useDashboardWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  
  // Buffers
  const priceBufferRef = useRef<PriceTick[]>([]);
  const priceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Map to store only the LATEST updates for snapshot channels
  const snapshotBufferRef = useRef<Record<string, any>>({});
  const snapshotTimerRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  const { setConnected: setWsConnected, updatePrices, setPositions, setSpreads, setTrades, setStrategies, setBotStatus } = useTradingStore();
  const { setSignals, setMetrics, setAdminStatus } = useDashboardStore();

  const flushPrices = useCallback(() => {
    if (priceBufferRef.current.length > 0) {
      updatePrices([...priceBufferRef.current]);
      priceBufferRef.current = [];
    }
    priceTimerRef.current = null;
  }, [updatePrices]);

  const flushSnapshot = useCallback((channel: string) => {
    const data = snapshotBufferRef.current[channel];
    if (data === undefined) return;
    
    snapshotBufferRef.current[channel] = undefined;
    snapshotTimerRef.current[channel] = null;

    switch (channel) {
      case 'pnl': setMetrics(data); break;
      case 'positions': setPositions(data); break;
      case 'spreads': setSpreads(data); break;
      case 'trades': setTrades(data); break;
      case 'strategies': setStrategies(data); break;
      case 'bot_status': setBotStatus(data); break;
      case 'signals': setSignals(data); break;
      case 'admin': setAdminStatus(data); break;
    }
  }, [setMetrics, setPositions, setSpreads, setTrades, setStrategies, setBotStatus, setSignals, setAdminStatus]);

  const queueSnapshotUpdate = useCallback((channel: string, data: any, delay = 100) => {
    snapshotBufferRef.current[channel] = data; // Keep only latest
    if (!snapshotTimerRef.current[channel]) {
      snapshotTimerRef.current[channel] = setTimeout(() => flushSnapshot(channel), delay);
    }
  }, [flushSnapshot]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    const wsUrl = import.meta.env.VITE_WS_URL ?? `ws://${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({
          type: 'subscribe',
          channels: ['pnl', 'positions', 'spreads', 'trades', 'strategies', 'bot_status', 'signals', 'admin', 'health', 'price_update']
        }));
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (mountedRef.current) {
          setTimeout(connect, 2000); // Reconnect backoff
        }
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          switch (message.type) {
            case 'price_update':
              priceBufferRef.current.push(message.payload ?? message);
              if (!priceTimerRef.current) {
                priceTimerRef.current = setTimeout(flushPrices, 100); // Throttled price flush (100ms)
              }
              break;
            case 'pnl_update':
              queueSnapshotUpdate('pnl', message.metrics ?? message.data, 250);
              break;
            case 'position_update':
            case 'positions':
              queueSnapshotUpdate('positions', message.positions ?? message.data, 100);
              break;
            case 'spread_update':
            case 'spreads':
              queueSnapshotUpdate('spreads', message.spreads ?? message.data, 200);
              break;
            case 'trade_update':
            case 'trades':
              queueSnapshotUpdate('trades', message.trades ?? message.data, 150);
              break;
            case 'strategy_update':
              queueSnapshotUpdate('strategies', message.strategies ?? message.data, 500);
              break;
            case 'bot_status_update':
              queueSnapshotUpdate('bot_status', message.status ?? message.data, 500);
              break;
            case 'signal_update':
              queueSnapshotUpdate('signals', message.signals ?? message.data, 200);
              break;
            case 'admin_update':
              queueSnapshotUpdate('admin', message.status ?? message.data, 100);
              break;
            case 'snapshot':
              // Batch immediate snapshot setup
              if (message.pnl) setMetrics(message.pnl);
              if (message.positions) setPositions(message.positions);
              if (message.spreads) setSpreads(message.spreads);
              if (message.trades) setTrades(message.trades);
              if (message.strategies) setStrategies(message.strategies);
              if (message.botStatus) setBotStatus(message.botStatus);
              if (message.signals) setSignals(message.signals);
              if (message.adminStatus) setAdminStatus(message.adminStatus);
              break;
          }
        } catch (err) {
          console.error('[WebSocket] Parsing failed:', err);
        }
      };
    } catch (e) {
      setWsConnected(false);
    }
  }, [setWsConnected, flushPrices, queueSnapshotUpdate, setMetrics, setPositions, setSpreads, setTrades, setStrategies, setBotStatus, setSignals, setAdminStatus]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      if (priceTimerRef.current) clearTimeout(priceTimerRef.current);
      Object.values(snapshotTimerRef.current).forEach(t => t && clearTimeout(t));
    };
  }, [connect]);
}
```

### B. Isolating the Global Timer (`dashboard-page.tsx`)
Create a small, isolated label component to capture the `useNow()` updates, and hook the signals/metrics hooks into the shared dashboard store.

```typescript
// Sub-component to isolate timer updates
import React, { memo } from 'react';

const LastUpdatedLabel = memo(function LastUpdatedLabel() {
  const time = useNow();
  return <span className="text-muted text-xs hidden sm:inline font-mono">Updated {time}</span>;
});

// Update the hooks to populate the global stores, so the UI can listen directly to the stores
export function DashboardPage() {
  useDashboardWebSocket(); // Single connection instead of duplicate hooks

  const { loading: signalsLoading, error: signalsError, refresh: refreshSignals } = useSignals(0, 50);
  const { loading: pnlLoading, error: pnlError } = usePnlAnalytics();
  const { status: adminStatus, halt, resume, loading: adminLoading, error: adminError, refresh: refreshAdmin } = useAdminControls();
  useHealthStatus();

  // Subscribe to slices of stores directly (read-only real-time values!)
  const positions = useTradingStore((s) => s.positions);
  const spreads = useTradingStore((s) => s.spreads);
  const strategies = useTradingStore((s) => s.strategies);
  const trades = useTradingStore((s) => s.trades);
  const botStatus = useTradingStore((s) => s.botStatus);
  
  // Real-time updates populated by WebSocket now feed into components:
  const signals = useDashboardStore((s) => s.signals);
  const metrics = useDashboardStore((s) => s.metrics);

  const openCount = positions.filter((p: any) => p.status === 'open').length;
  const activeStrategies = strategies?.filter((s: any) => s.enabled).length ?? 0;

  if (pnlLoading || signalsLoading || adminLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Title & Info */}
        ...
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <CacheStatus />
          <LastUpdatedLabel /> {/* Prevents main page from re-rendering every second */}
          ...
        </div>
      </div>
      ...
    </div>
  );
}
```

### C. Direct Canvas Rendering in Candlestick Chart (`candlestick-chart.tsx`)
By bypassing React state re-renders, the component loads the data, draws it to the canvas, and listens directly to store updates to call `.update()` out-of-band:

```typescript
import { useEffect, useRef, useState, memo } from 'react';
import { createChart, ColorType, LineStyle, ISeriesApi, Time } from 'lightweight-charts';
import { useTradingStore } from '../stores/trading-store';

export const CandlestickChart = memo(function CandlestickChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);

  const [activePair, setActivePair] = useState<string>('binance:BTC/USDT');

  // Obtain current list of tickers dynamically (shallow checked to prevent constant re-renders)
  const tickers = useTradingStore(
    (s) => Object.keys(s.prices),
    (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
  );

  // Initialize Chart Instance (Run ONCE on Mount)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height: 350,
      layout: {
        background: { type: ColorType.Solid, color: '#101426' },
        textColor: '#8892B0',
        fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)', style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { color: '#00FFA3', width: 1, labelVisible: true },
        horzLine: { color: '#00FFA3', width: 1, labelVisible: true },
      },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.05)', scaleMargins: { top: 0.1, bottom: 0.3 } },
      timeScale: { borderColor: 'rgba(255, 255, 255, 0.05)', timeVisible: true },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00FFA3',
      downColor: '#FF2E93',
      borderUpColor: '#00FFA3',
      borderDownColor: '#FF2E93',
      wickUpColor: '#00FFA3',
      wickDownColor: '#FF2E93',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#00D9FF',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
    });

    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    chartRef.current = chart;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chartRef.current) {
        chartRef.current.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Fetch initial history or mock history when ActivePair changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    // Load initial 100 historical candles
    const list: any[] = [];
    const now = Math.floor(Date.now() / 1000);
    let close = 50000;
    for (let i = 100; i >= 0; i--) {
      const open = close + (Math.random() - 0.5) * 100;
      const high = Math.max(open, close) + Math.random() * 50;
      const low = Math.min(open, close) - Math.random() * 50;
      close = open + (Math.random() - 0.5) * 100;
      list.push({ time: (now - i * 60) as any, open, high, low, close });
    }

    candleSeriesRef.current.setData(list);

    const volumeData = list.map((c) => ({
      time: c.time,
      value: Math.abs(c.close - c.open) * (1000 + Math.random() * 500),
      color: c.close >= c.open ? 'rgba(0, 255, 163, 0.25)' : 'rgba(255, 46, 147, 0.25)',
    }));
    volumeSeriesRef.current.setData(volumeData);
  }, [activePair]);

  // Out-of-band tick updates: Subscribes ONLY to the active ticker. 
  // Runs direct DOM canvas updates without invoking a single React re-render.
  useEffect(() => {
    let lastCandleTime = 0;
    let openPrice = 0;
    let highPrice = 0;
    let lowPrice = 0;
    let lastClose = 0;

    const unsubscribe = useTradingStore.subscribe(
      (state) => state.prices[activePair],
      (tick) => {
        if (!tick || !candleSeriesRef.current || !volumeSeriesRef.current) return;

        const midPrice = (tick.bid + tick.ask) / 2;
        const nowSeconds = Math.floor(tick.timestamp / 1000);
        const minuteSeconds = Math.floor(nowSeconds / 60) * 60;

        const isNewMinute = minuteSeconds > lastCandleTime;

        if (isNewMinute || lastCandleTime === 0) {
          openPrice = lastClose !== 0 ? lastClose : midPrice;
          highPrice = Math.max(openPrice, midPrice);
          lowPrice = Math.min(openPrice, midPrice);
          lastCandleTime = minuteSeconds;
        } else {
          highPrice = Math.max(highPrice, midPrice);
          lowPrice = Math.min(lowPrice, midPrice);
        }
        lastClose = midPrice;

        const candleUpdate = {
          time: minuteSeconds as any,
          open: openPrice,
          high: highPrice,
          low: lowPrice,
          close: midPrice,
        };

        candleSeriesRef.current.update(candleUpdate);

        volumeSeriesRef.current.update({
          time: minuteSeconds as any,
          value: Math.abs(midPrice - openPrice) * 1200,
          color: midPrice >= openPrice ? 'rgba(0, 255, 163, 0.25)' : 'rgba(255, 46, 147, 0.25)',
        });
      }
    );

    return () => unsubscribe();
  }, [activePair]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-semibold">Real-Time Chart</span>
          <select
            value={activePair}
            onChange={(e) => setActivePair(e.target.value)}
            className="bg-bg border border-white/5 rounded px-2.5 py-1 text-accent text-xs font-mono focus:outline-none focus:border-accent"
          >
            {tickers.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        ...
      </div>
      <div ref={containerRef} className="w-full flex-grow min-h-[350px]" />
    </div>
  );
});
```

### D. Single Chart Mount Lifecycle (`price-chart-lightweight.tsx`)
Separating chart initialization from data updates:

```typescript
import { useEffect, useRef, memo } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';

export const PriceChartLightweight = memo(function PriceChartLightweight({
  data,
  height = 300,
  color = '#00D9FF',
  title,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  // 1. Create Chart ONCE on Mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0F0F1A' },
        textColor: '#8892B0',
        fontFamily: 'Menlo, Monaco, Courier New, monospace',
      },
      grid: {
        vertLines: { color: '#2D3142', style: LineStyle.Dotted },
        horzLines: { color: '#2D3142', style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { color: '#00D9FF', width: 1 },
        horzLine: { color: '#00D9FF', width: 1 },
      },
      rightPriceScale: { borderColor: '#2D3142' },
      timeScale: { borderColor: '#2D3142', timeVisible: true },
    });

    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: `${color}33`,
      bottomColor: `${color}00`,
      lineWidth: 2,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && chartRef.current) {
        chartRef.current.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]); // Only recreate if height changes

  // 2. Incremental Data Updates (Does not recreate chart)
  useEffect(() => {
    if (seriesRef.current && data && data.length > 0) {
      seriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data]);

  // 3. Dynamic Styling Updates
  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.applyOptions({
        lineColor: color,
        topColor: `${color}33`,
      });
    }
  }, [color]);

  const hasData = data && data.length > 0;

  return (
    <div className="relative w-full">
      {title && <p className="text-muted text-[10px] uppercase tracking-widest mb-1">{title}</p>}
      <div ref={containerRef} style={{ height }} className="w-full" />
      {!hasData && <div className="absolute inset-0 flex items-center justify-center text-muted text-xs">No chart data</div>}
    </div>
  );
});
```

### E. GPU CSS Price Flashing (`price-ticker-strip.tsx`)
Optimize by eliminating state dispatches to clear flashes:

```css
/* In index.css or Tailwind utilities */
@keyframes green-flash-fade {
  0% { background-color: rgba(0, 255, 163, 0.25); border-color: rgba(0, 255, 163, 0.6); }
  100% { background-color: rgba(16, 20, 38, 0.8); border-color: rgba(255, 255, 255, 0.05); }
}

@keyframes red-flash-fade {
  0% { background-color: rgba(255, 46, 147, 0.25); border-color: rgba(255, 46, 147, 0.6); }
  100% { background-color: rgba(16, 20, 38, 0.8); border-color: rgba(255, 255, 255, 0.05); }
}

.flash-up-anim {
  animation: green-flash-fade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.flash-down-anim {
  animation: red-flash-fade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

```typescript
import { useEffect, useRef, useState, memo } from 'react';
import { useTradingStore, PriceTick } from '../stores/trading-store';

export const PriceTickerStrip = memo(function PriceTickerStrip() {
  const prices = useTradingStore((s) => s.prices);
  const prevPricesRef = useRef<Record<string, number>>({});
  const flashStatesRef = useRef<Record<string, { direction: 'up' | 'down' | null; version: number }>>({});
  
  // Local state only stores key parameters to trigger rendering structure updates
  const entries = Object.values(prices);

  if (entries.length === 0) {
    return <div className="flex px-4 py-2 text-muted text-xs font-mono"><span className="animate-pulse">Waiting for price data...</span></div>;
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="flex gap-3 px-1 py-1 min-w-max">
        {entries.map((tick) => {
          const key = `${tick.exchange}:${tick.symbol}`;
          const prevMid = prevPricesRef.current[key];
          const mid = (tick.bid + tick.ask) / 2;

          let flashClass = "bg-bg-card border-bg-border";
          let currentDirection: 'up' | 'down' | null = null;
          
          if (prevMid !== undefined && mid !== prevMid) {
            currentDirection = mid > prevMid ? 'up' : 'down';
            const record = flashStatesRef.current[key] || { direction: null, version: 0 };
            flashStatesRef.current[key] = {
              direction: currentDirection,
              version: record.version + 1
            };
          }

          const activeFlash = flashStatesRef.current[key];
          if (activeFlash?.direction === 'up') {
            flashClass = "flash-up-anim";
          } else if (activeFlash?.direction === 'down') {
            flashClass = "flash-down-anim";
          }

          prevPricesRef.current[key] = mid;

          return (
            <div
              key={`${key}-${activeFlash?.version ?? 0}`} // Changing key restarts CSS animation out-of-band!
              className={`flex flex-col gap-0.5 px-3 py-2 rounded border min-w-[140px] ${flashClass}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-accent text-xs font-mono font-bold truncate">{tick.exchange}</span>
                <span className="text-white text-xs font-mono font-semibold">{tick.symbol}</span>
              </div>
              <div className="flex gap-2 text-xs font-mono">
                <span className={activeFlash?.direction === 'up' ? 'text-profit' : activeFlash?.direction === 'down' ? 'text-loss' : 'text-white'}>
                  B {formatPrice(tick.bid)}
                </span>
                <span className="text-muted">|</span>
                <span className={activeFlash?.direction === 'up' ? 'text-profit' : activeFlash?.direction === 'down' ? 'text-loss' : 'text-muted'}>
                  A {formatPrice(tick.ask)}
                </span>
              </div>
              <div className="text-muted text-[10px] font-mono">{spreadBps(tick.bid, tick.ask)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
```

### F. Table List Virtualization / Top-N Slicing (`signals-panel.tsx`)
Implements an optimized list display that limits rendering to the top 15 most profitable signals to reduce DOM node volume, and uses `React.memo` to avoid re-renders:

```typescript
import { useState, useMemo, memo } from 'react';
import type { Signal } from '../types/api';

interface SignalsPanelProps {
  signals: Signal[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export const SignalsPanel = memo(function SignalsPanel({
  signals,
  loading,
  error,
  onRefresh,
}: SignalsPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('spread');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [displayLimit, setDisplayLimit] = useState(15); // Show top 15 by default to protect DOM

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const sortedSignals = useMemo(() => {
    const list = [...signals];
    return list.sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'spread': comparison = b.spread - a.spread; break;
        case 'latency': comparison = a.latency - b.latency; break;
        case 'timestamp': comparison = b.timestamp - a.timestamp; break;
        case 'symbol': comparison = a.symbol.localeCompare(b.symbol); break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [signals, sortKey, sortDirection]);

  // Virtualized slice
  const visibleSignals = useMemo(() => {
    return sortedSignals.slice(0, displayLimit);
  }, [sortedSignals, displayLimit]);

  if (loading) return <div className="p-8 text-center text-muted">Loading signals...</div>;
  if (error) return <div className="p-8 text-center text-loss">{error}</div>;

  return (
    <div className="bg-bg-card border border-bg-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
        <h3 className="text-white text-sm font-semibold">
          Arbitrage Signals
          <span className="text-[10px] text-muted ml-2">
            (Showing {visibleSignals.length} of {signals.length} opportunities)
          </span>
        </h3>
        ...
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-bg-subtle text-muted uppercase tracking-wider">
             ...
          </thead>
          <tbody>
            {visibleSignals.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No arbitrage opportunities found</td></tr>
            ) : (
              visibleSignals.map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))
            )}
          </tbody>
        </table>
      </div>
      {signals.length > displayLimit && (
        <div className="p-2 text-center border-t border-bg-border">
          <button 
            onClick={() => setDisplayLimit(prev => prev + 15)}
            className="text-xs text-accent hover:underline font-mono px-4 py-1"
          >
            Show More (+15)
          </button>
        </div>
      )}
    </div>
  );
});

// Row components separated to isolate re-render nodes
const SignalRow = memo(function SignalRow({ signal }: { signal: Signal }) {
  return (
    <tr className="border-t border-bg-border hover:bg-bg-subtle/50 font-mono">
      <td className="px-4 py-3 font-semibold text-white">{signal.symbol}</td>
      <td className="px-4 py-3 text-muted">{signal.buyExchange}</td>
      <td className="px-4 py-3 text-muted">{signal.sellExchange}</td>
      <td className="px-4 py-3 text-right text-profit">${signal.buyPrice.toFixed(2)}</td>
      <td className="px-4 py-3 text-right text-loss">${signal.sellPrice.toFixed(2)}</td>
      <td className="px-4 py-3 text-right font-semibold text-accent">{signal.spread.toFixed(3)}%</td>
      <td className="px-4 py-3 text-right text-muted">{signal.latency}ms</td>
      <td className="px-4 py-3 text-right text-muted">{formatAge(signal.timestamp)}</td>
    </tr>
  );
});
```

---

## 5. Summary of Recommended Actions

1. **Delete `use-websocket-price-feed.ts` and `use-realtime-updates.ts`** and substitute them with the unified `useDashboardWebSocket.ts`.
2. **Move `useNow` out of the root page component** and wrap the live timer in its own isolated sub-component.
3. **Refactor the REST Hooks (`useSignals`, `usePnlAnalytics`)** to write to the global Zustand stores instead of using local states, allowing the components to consume a unified store state populated in real-time by the WebSocket hook.
4. **Rewrite chart initialization and tick listener flow** in `CandlestickChart` to update via `.update()` instead of `.setData()` inside React states.
5. **Optimize visual flashing in `PriceTickerStrip`** to run entirely in CSS keyframe transitions, avoiding React timeouts and state clears.
6. **Wrap all rendering components in `React.memo`** and extract rows to sub-components to limit the Virtual DOM depth that gets re-evaluated when states change.
