import type { PaperPortfolio, PaperTrade } from '../../../desk/wiring/paper-trading-orchestrator';

export function makeTrade(
  overrides: Partial<{
    id: string;
    marketId: string;
    side: 'YES' | 'NO';
    size: number;
    entryPrice: number;
    strategy: string;
    source: string;
    signalConfidence: number;
    swarmApproved: boolean;
    aiValidated: boolean;
    timestamp: number;
    exitPrice: number;
    pnl: number;
  }> = {},
): PaperTrade & { exitPrice: number; pnl: number } {
  const ts = overrides.timestamp ?? Date.now();
  return {
    ...overrides,
    id: overrides.id ?? `trade-${ts}-${Math.random().toString(36).slice(2, 6)}`,
    marketId: overrides.marketId ?? 'mkt-1',
    side: overrides.side ?? 'YES',
    size: overrides.size ?? 100,
    entryPrice: overrides.entryPrice ?? 0.5,
    strategy: overrides.strategy ?? 'qwen-test',
    source: overrides.source ?? 'qwen',
    signalConfidence: overrides.signalConfidence ?? 0.8,
    swarmApproved: overrides.swarmApproved ?? true,
    aiValidated: overrides.aiValidated ?? true,
    timestamp: ts,
    exitPrice: overrides.exitPrice ?? 0.6,
    pnl: overrides.pnl ?? 10,
  };
}

export function makePortfolio(
  overrides: Partial<{
    capital: number;
    totalPnl: number;
    winCount: number;
    lossCount: number;
    positions: PaperTrade[];
    closedTrades: Array<PaperTrade & { exitPrice: number; pnl: number }>;
  }> = {},
): PaperPortfolio {
  return {
    capital: overrides.capital ?? 1000,
    totalPnl: overrides.totalPnl ?? 0,
    winCount: overrides.winCount ?? 0,
    lossCount: overrides.lossCount ?? 0,
    positions: overrides.positions ?? [],
    closedTrades: overrides.closedTrades ?? [],
  };
}
