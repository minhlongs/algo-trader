/**
 * WebSocket hook for dashboard real-time updates
 * Subscribes to signal updates, P&L changes, and admin events
 */
/**
 * Consolidated WebSocket hook for dashboard real-time updates.
 * Implements 100ms buffering for price ticks and a snapshot-overwriting
 * buffer for P&L, signals, positions, trades, strategies, and other updates.
 * Populates both useTradingStore and useDashboardStore.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useDashboardStore } from '../stores/dashboard-store';
import { useTradingStore, PriceTick, Position, SpreadOpportunity, StrategyStatus, TradeRecord, BotStatus } from '../stores/trading-store';
import type { Signal, PerformanceMetrics, AdminStatus } from '../types/api';

export interface LatencyMetrics {
  lastLatency: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
}

export function useDashboardWebSocket() {
  const [connected, setConnectedState] = useState(false);
  const [latency, setLatency] = useState<LatencyMetrics>({
    lastLatency: 0,
    avgLatency: 0,
    minLatency: Infinity,
    maxLatency: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);
  const latencySamplesRef = useRef<number[]>([]);

  // Buffering states
  const priceTicksBufferRef = useRef<PriceTick[]>([]);
  const pnlBufferRef = useRef<PerformanceMetrics | null>(null);
  const signalsBufferRef = useRef<Signal[] | null>(null);
  const positionsBufferRef = useRef<Position[] | null>(null);
  const tradesBufferRef = useRef<TradeRecord[] | null>(null);
  const strategiesBufferRef = useRef<StrategyStatus[] | null>(null);
  const botStatusBufferRef = useRef<BotStatus | null>(null);
  const spreadsBufferRef = useRef<SpreadOpportunity[] | null>(null);
  const adminStatusBufferRef = useRef<AdminStatus | null>(null);

  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setSignals, setMetrics, setAdminStatus } = useDashboardStore();
  const {
    setConnected: setWsConnected,
    setPositions,
    setSpreads,
    setTrades,
    setStrategies,
    setBotStatus,
    updatePrices,
  } = useTradingStore();

  const updateLatency = useCallback((latencyMs: number) => {
    setLatency((prev) => {
      const samples = latencySamplesRef.current;
      samples.push(latencyMs);
      if (samples.length > 100) samples.shift();

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

      return {
        lastLatency: latencyMs,
        avgLatency: Math.round(avg),
        minLatency: Math.min(prev.minLatency, latencyMs),
        maxLatency: Math.max(prev.maxLatency, latencyMs),
      };
    });
  }, []);

  const flushAll = useCallback(() => {
    // 1. Price ticks
    if (priceTicksBufferRef.current.length > 0) {
      updatePrices([...priceTicksBufferRef.current]);
      priceTicksBufferRef.current = [];
    }
    // 2. P&L (Metrics)
    if (pnlBufferRef.current !== null) {
      setMetrics(pnlBufferRef.current);
      pnlBufferRef.current = null;
    }
    // 3. Signals
    if (signalsBufferRef.current !== null) {
      setSignals(signalsBufferRef.current);
      signalsBufferRef.current = null;
    }
    // 4. Positions
    if (positionsBufferRef.current !== null) {
      setPositions(positionsBufferRef.current);
      positionsBufferRef.current = null;
    }
    // 5. Trades
    if (tradesBufferRef.current !== null) {
      setTrades(tradesBufferRef.current);
      tradesBufferRef.current = null;
    }
    // 6. Strategies
    if (strategiesBufferRef.current !== null) {
      setStrategies(strategiesBufferRef.current);
      strategiesBufferRef.current = null;
    }
    // 7. Bot Status
    if (botStatusBufferRef.current !== null) {
      setBotStatus(botStatusBufferRef.current);
      botStatusBufferRef.current = null;
    }
    // 8. Spreads
    if (spreadsBufferRef.current !== null) {
      setSpreads(spreadsBufferRef.current);
      spreadsBufferRef.current = null;
    }
    // 9. Admin Status
    if (adminStatusBufferRef.current !== null) {
      setAdminStatus(adminStatusBufferRef.current);
      adminStatusBufferRef.current = null;
    }
  }, [updatePrices, setMetrics, setSignals, setPositions, setTrades, setStrategies, setBotStatus, setSpreads, setAdminStatus]);

  const queueUpdate = useCallback(() => {
    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushAll();
      }, 100);
    }
  }, [flushAll]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const wsUrl = import.meta.env.VITE_WS_URL ?? `ws://${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectedState(true);
        setError(null);
        setWsConnected(true);
        setReconnectCount(0);
        reconnectDelayRef.current = 1000;

        // Subscribe to channels
        ws.send(JSON.stringify({
          type: 'subscribe',
          channels: ['signals', 'pnl', 'admin', 'health', 'positions', 'spreads', 'trades', 'strategies', 'bot_status', 'all'],
        }));

        // Request initial snapshot
        ws.send(JSON.stringify({ type: 'snapshot_request' }));
      };

      ws.onclose = () => {
        setConnectedState(false);
        setWsConnected(false);

        if (!mountedRef.current) return;

        const delay = Math.min(reconnectDelayRef.current, 30000);
        reconnectDelayRef.current = delay * 2;
        setReconnectCount((c) => c + 1);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (_err) => {
        setError('Connection error - reconnecting...');
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const serverTime = message.timestamp ?? Date.now();
          const clientTime = Date.now();
          const latencyMs = clientTime - serverTime;

          if (message.type && !message.type.includes('ack')) {
            updateLatency(latencyMs);
          }

          switch (message.type) {
            case 'price_update': {
              const tick = message.payload ?? message.data ?? message;
              if (Array.isArray(tick)) {
                priceTicksBufferRef.current.push(...tick);
              } else {
                priceTicksBufferRef.current.push(tick);
              }
              queueUpdate();
              break;
            }

            case 'signals_update':
            case 'signal_update':
              signalsBufferRef.current = message.signals ?? message.data;
              queueUpdate();
              break;

            case 'pnl_update':
              pnlBufferRef.current = message.metrics ?? message.data;
              queueUpdate();
              break;

            case 'position_update':
            case 'positions':
              positionsBufferRef.current = message.positions ?? message.data;
              queueUpdate();
              break;

            case 'spread_update':
            case 'spreads':
              spreadsBufferRef.current = message.spreads ?? message.data;
              queueUpdate();
              break;

            case 'trade_update':
            case 'trades':
              tradesBufferRef.current = message.trades ?? message.data;
              queueUpdate();
              break;

            case 'trade_executed': {
              const trade = message.trade ?? message.data;
              if (trade) {
                if (tradesBufferRef.current === null) {
                  const currentTrades = useTradingStore.getState().trades;
                  tradesBufferRef.current = [trade, ...currentTrades].slice(0, 100);
                } else {
                  tradesBufferRef.current = [trade, ...tradesBufferRef.current].slice(0, 100);
                }
                queueUpdate();
              }
              break;
            }

            case 'strategy_update':
            case 'strategy_status':
              strategiesBufferRef.current = message.strategies ?? message.data;
              queueUpdate();
              break;

            case 'bot_status_update':
            case 'bot_status':
              botStatusBufferRef.current = message.status ?? message.data;
              queueUpdate();
              break;

            case 'admin_update':
              adminStatusBufferRef.current = message.status ?? message.data;
              queueUpdate();
              break;

            case 'health_update':
              break;

            case 'snapshot':
              if (message.pnl) setMetrics(message.pnl);
              if (message.metrics) setMetrics(message.metrics);
              if (message.positions) setPositions(message.positions);
              if (message.spreads) setSpreads(message.spreads);
              if (message.trades) setTrades(message.trades);
              if (message.strategies) setStrategies(message.strategies);
              if (message.botStatus) setBotStatus(message.botStatus);
              if (message.signals) setSignals(message.signals);
              if (message.adminStatus) setAdminStatus(message.adminStatus);
              break;

            default:
              if (message.channel === 'spread') {
                const tick = message.payload ?? message.data ?? message;
                if (Array.isArray(tick)) {
                  priceTicksBufferRef.current.push(...tick);
                } else {
                  priceTicksBufferRef.current.push(tick);
                }
                queueUpdate();
              }
              break;
          }
        } catch (error) {
        }
      };
    } catch (error) {
      setConnectedState(false);
      setWsConnected(false);
      setError('Connection failed - retrying...');
    }
  }, [setWsConnected, setSignals, setMetrics, setAdminStatus, setPositions, setSpreads, setTrades, setStrategies, setBotStatus, updateLatency, queueUpdate, flushAll]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    reconnectDelayRef.current = 1000;
    setReconnectCount(0);
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, [connect]);

  return {
    connected,
    latency: {
      ...latency,
      minLatency: latency.minLatency === Infinity ? 0 : latency.minLatency,
    },
    error,
    reconnectCount,
    reconnect,
  };
}

