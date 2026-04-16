/**
 * Hook: useSubscriberPnl
 * Fetches P&L summary, equity curve, activity metrics, and daily breakdown
 * for a single subscriber from /api/subscriber/:id/*
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';

export interface SubscriberPnLSummary {
  subscriberId: string;
  totalRealizedPnl: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  blockedDlpCount: number;
}

export interface EquityCurvePoint {
  date: string;
  nav: number;
  dailyPnl: number;
}

export interface EquityCurveResult {
  subscriberId: string;
  startingCapital: number;
  currentNav: number;
  totalReturn: number;
  maxDrawdown: number;
  curve: EquityCurvePoint[];
}

export interface SubscriberActivityMetrics {
  subscriberId: string;
  activeSignalsCount: number;
  totalFillsCount: number;
  blockedDlpCount: number;
  pendingOrdersCount: number;
  lastActivityMs: number | null;
}

export interface SubscriberDailyPnL {
  date: string;
  netPnl: number;
  tradeCount: number;
  winRate: number;
}

export interface SubscriberDailyBreakdown {
  subscriberId: string;
  breakdown: SubscriberDailyPnL[];
}

interface UseSubscriberPnlResult {
  summary: SubscriberPnLSummary | null;
  equity: EquityCurveResult | null;
  activity: SubscriberActivityMetrics | null;
  dailyBreakdown: SubscriberDailyPnL[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSubscriberPnl(subscriberId: string | null): UseSubscriberPnlResult {
  const [summary, setSummary] = useState<SubscriberPnLSummary | null>(null);
  const [equity, setEquity] = useState<EquityCurveResult | null>(null);
  const [activity, setActivity] = useState<SubscriberActivityMetrics | null>(null);
  const [dailyBreakdown, setDailyBreakdown] = useState<SubscriberDailyPnL[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!subscriberId) return;
    setLoading(true);
    setError(null);

    try {
      const [summaryData, equityData, activityData, tradesData] = await Promise.all([
        apiClient.get<SubscriberPnLSummary>(`/subscriber/${subscriberId}/pnl`),
        apiClient.get<EquityCurveResult>(`/subscriber/${subscriberId}/equity`),
        apiClient.get<SubscriberActivityMetrics>(`/subscriber/${subscriberId}/activity`),
        apiClient.get<SubscriberDailyBreakdown>(`/subscriber/${subscriberId}/trades`),
      ]);

      setSummary(summaryData);
      setEquity(equityData);
      setActivity(activityData);
      setDailyBreakdown(tradesData?.breakdown ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriber data');
    } finally {
      setLoading(false);
    }
  }, [subscriberId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { summary, equity, activity, dailyBreakdown, loading, error, refresh: fetch };
}
