import { create } from 'zustand';
import { useRiskPreferencesStore } from './risk-preferences-store';
import { useTradingStore } from './trading-store';
import { TradeRecord, Position } from './trading-store';

export interface NegRiskOpportunity {
  id: string;
  market: string;
  yesAsk: number;
  noAsk: number;
  sum: number;
  lockedProfit: number;
}

export interface NegRiskScannerStats {
  totalScanned: number;
  opportunitiesFound: number;
  totalLockedProfit: number;
  activeTrades: number;
  avgProfit: number;
}

interface NegRiskScannerState {
  opportunities: NegRiskOpportunity[];
  stats: NegRiskScannerStats;
  loading: boolean;
  lastRefresh: number;
  fetchOpportunities: (threshold: number) => Promise<void>;
  executeTrade: (id: string) => void;
  // Integration methods
  shouldAutoClosePosition: (position: Position) => boolean;
  isCircuitBreakerTriggered: () => boolean;
}

const emptyStats: NegRiskScannerStats = {
  totalScanned: 0,
  opportunitiesFound: 0,
  totalLockedProfit: 0,
  activeTrades: 0,
  avgProfit: 0,
};

function demoOpportunities(threshold: number): NegRiskOpportunity[] {
  return [
    { id: 'demo-1', market: 'Will Fed cut rates in July?', yesAsk: 0.42, noAsk: 0.56, sum: 0.98, lockedProfit: Math.max(0, threshold - 0.98) },
    { id: 'demo-2', market: 'BTC above $120k by Q3?', yesAsk: 0.38, noAsk: 0.60, sum: 0.98, lockedProfit: Math.max(0, threshold - 0.98) },
  ];
}

export const useNegRiskScannerStore = create<NegRiskScannerState>()((set) => ({
  opportunities: [],
  stats: emptyStats,
  loading: false,
  lastRefresh: 0,

  fetchOpportunities: async (threshold: number) => {
    set({ loading: true });
    try {
      const res = await fetch(`/dashboard/api/neg-risk-scan?threshold=${threshold}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const opportunities = data.opportunities ?? demoOpportunities(threshold);
      const lockedProfit = opportunities.reduce((sum: number, opp: NegRiskOpportunity) => sum + opp.lockedProfit, 0);
      set({
        opportunities,
        stats: {
          totalScanned: data.totalScanned ?? opportunities.length,
          opportunitiesFound: opportunities.length,
          totalLockedProfit: lockedProfit,
          activeTrades: data.activeTrades ?? 0,
          avgProfit: opportunities.length > 0 ? lockedProfit / opportunities.length : 0,
        },
        lastRefresh: Date.now(),
      });
    } catch {
      const opportunities = demoOpportunities(threshold);
      const lockedProfit = opportunities.reduce((sum: number, opp: NegRiskOpportunity) => sum + opp.lockedProfit, 0);
      set({
        opportunities,
        stats: {
          totalScanned: opportunities.length,
          opportunitiesFound: opportunities.length,
          totalLockedProfit: lockedProfit,
          activeTrades: 0,
          avgProfit: opportunities.length > 0 ? lockedProfit / opportunities.length : 0,
        },
        lastRefresh: Date.now(),
      });
    } finally {
      set({ loading: false });
    }
  },

  executeTrade: (id: string) => {
    set((state) => ({
      stats: {
        ...state.stats,
        activeTrades: state.stats.activeTrades + 1,
      },
      opportunities: state.opportunities.filter((opp) => opp.id !== id),
    }));
  },

  shouldAutoClosePosition: (position: Position): boolean => {
    const prefs = useRiskPreferencesStore.getState();
    if (!prefs.autoCloseEnabled) return false;

    // Check max loss per trade (position.pnl is negative for loss)
    if (position.pnl <= -prefs.maxLossPerTrade) {
      return true;
    }

    // Check position size relative to portfolio (simplified: need portfolio value)
    // For now, skip position size check as it requires total equity
    return false;
  },

  isCircuitBreakerTriggered: (): boolean => {
    const prefs = useRiskPreferencesStore.getState();
    if (!prefs.circuitBreakerEnabled) return false;

    const trading = useTradingStore.getState();
    // Check consecutive losses from recent trades
    const recentTrades = [...trading.trades].slice(0, prefs.maxConsecutiveLosses);
    const consecutiveLosses = recentTrades.filter((t: TradeRecord) => t.pnl < 0).length;
    if (consecutiveLosses >= prefs.maxConsecutiveLosses) {
      return true;
    }

    // Check max drawdown (simplified: compare dailyPnl to threshold)
    // Could use botStatus.dailyPnl if available
    return false;
  },
}));
