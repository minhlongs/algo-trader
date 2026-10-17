/**
 * Paper Trading Types & Source Helpers
 *
 * @module desk/wiring/paper-trading-types
 */

export interface PaperTrade {
  id: string;
  marketId: string;
  side: 'YES' | 'NO';
  size: number; // USDC
  entryPrice: number;
  strategy: string;
  /** Source tag for A/B P&L ledger: 'qwen' | 'deepseek' | 'swarm' | 'legacy' */
  source: string;
  signalConfidence: number;
  swarmApproved: boolean;
  aiValidated: boolean;
  timestamp: number;
}

/** Derive source tag from strategy name prefix */
export function deriveSource(strategy: string): string {
  if (strategy.startsWith('qwen')) return 'qwen';
  if (strategy.startsWith('deepseek')) return 'deepseek';
  if (strategy.startsWith('swarm')) return 'swarm';
  return 'legacy';
}

export interface PaperPortfolio {
  capital: number;
  positions: PaperTrade[];
  closedTrades: Array<PaperTrade & { exitPrice: number; pnl: number }>;
  totalPnl: number;
  winCount: number;
  lossCount: number;
}
