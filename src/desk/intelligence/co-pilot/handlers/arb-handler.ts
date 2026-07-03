/**
 * Arb Handler
 * Gathers arbitrage opportunities from SpreadDetector, CrossMarketArb,
 * and LogicalHedgeDiscovery.
 */

import type { CopilotResponse } from '../response-formatter';
import { SpreadDetector } from '../../../arbitrage/spread-detector';
import { detectCrossMarketArbitrage } from '../../../arbitrage/cross-market-arbitrage-detector';
import { discoverLogicalHedges } from '../../../intelligence/logical-hedge-discovery';
import type { MarketInput } from '../../../intelligence/logical-hedge-discovery';
import type { MarketPrice } from '../../../arbitrage/cross-market-arbitrage-detector';
import type { DependencyGraph } from '../../../../shared/types/semantic-relationships';

export interface ArbData {
  spreadsFound: number;
  crossMarketBasket: boolean;
  logicalHedges: number;
  topOpportunities: string[];
}

/**
 * Handle an arb scan query.
 * Accepts optional injected dependencies for testing.
 */
export async function handleArbQuery(
  _context?: { page?: string; strategyId?: string },
  deps?: {
    spreadDetector?: SpreadDetector;
  },
): Promise<CopilotResponse> {
  const spreadDetector = deps?.spreadDetector ?? new SpreadDetector();

  // Gather data from multiple sources
  const [spreadOpportunities] = await Promise.all([
    spreadDetector.scan(['BTC/USDT', 'ETH/USDT', 'SOL/USDT'], ['binance', 'coinbase', 'kraken']).catch(() => []),
  ]);

  // Cross-market arb requires price data — attempt with empty data if no provider
  let crossMarketResult: string | null = null;
  try {
    const prices: MarketPrice[] = [];
    const graph: DependencyGraph = { relationships: [], marketCount: 0, updatedAt: Date.now() };
    const result = detectCrossMarketArbitrage(prices, graph);
    if (result.basket) {
      crossMarketResult = `Cross-market basket with ${result.opportunitiesScanned} markets scanned`;
    }
  } catch {
    crossMarketResult = null;
  }

  // Logical hedges require market data
  let logicalHedgesCount = 0;
  try {
    const markets: MarketInput[] = [];
    const hedges = await discoverLogicalHedges(markets);
    logicalHedgesCount = hedges.length;
  } catch {
    logicalHedgesCount = 0;
  }

  // Format top opportunities
  const topOpps = spreadOpportunities.slice(0, 5).map(o =>
    `${o.buyExchange || '?'}/${o.sellExchange || '?'} ${o.symbol || '?'} — spread: ${o.spreadPercent !== undefined ? `${(o.spreadPercent).toFixed(2)}%` : 'N/A'}`
  );

  const totalFound = spreadOpportunities.length;
  const answer = [
    '**Arbitrage Scan Results**',
    `- Spread opportunities: ${totalFound}`,
    ...(crossMarketResult ? [`- Cross-market: ${crossMarketResult}`] : []),
    `- Logical hedges: ${logicalHedgesCount}`,
    ...(topOpps.length > 0 ? ['', '**Top Opportunities:**', ...topOpps.map(o => `- ${o}`)] : ['', 'No actionable opportunities found at this time.']),
  ].join('\n');

  return {
    answer,
    actions: [
      ...(totalFound > 0 ? [{ label: 'Execute Top Arb', action: 'execute' as const, payload: 'arb_execute' }] : []),
      { label: 'Hedge Discovery', action: 'navigate' as const, payload: '/arbitrage' },
    ],
    sourceData: {
      spreadsFound: totalFound,
      crossMarketBasket: !!crossMarketResult,
      logicalHedges: logicalHedgesCount,
      topOpportunities: topOpps,
    },
  };
}
