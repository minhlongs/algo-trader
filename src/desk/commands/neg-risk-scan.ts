#!/usr/bin/env node
/**
 * Negative Risk Scanner CLI — scan all active Polymarket markets for arbitrage opportunities.
 *
 * Usage:
 *   npx cashclaw neg-risk-scan                — scan with default settings
 *   npx cashclaw neg-risk-scan --threshold 0.97 --minVolume 5000
 */

import { Command } from 'commander';
import { ClobClient } from '@polymarket/clob-client';
import { logger } from '../utils/logger.js';

const CLOB_HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137; // Polygon

export async function runNegRiskScan(options: {
  threshold: number;
  minVolumeUsdc: number;
  maxOpportunitySizeUsdc: number;
}): Promise<void> {
  const { threshold, minVolumeUsdc } = options;
  console.log(`Scanning for negative risk opportunities (threshold=${threshold}, minVolume=$${minVolumeUsdc})...\n`);

  // Fetch markets from Gamma API
  const gammaUrl = 'https://gamma-api.polymarket.com/markets?closed=false&limit=200';
  const resp = await fetch(gammaUrl, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) {
    throw new Error(`Gamma API error: HTTP ${resp.status}`);
  }
  const markets = await resp.json();

  // Create read-only CLOB client
  const clob = new ClobClient(CLOB_HOST, CHAIN_ID);

  const opportunities: Array<{
    market: string;
    conditionId: string;
    yesAsk: number;
    noAsk: number;
    totalCost: number;
    lockedProfit: number;
  }> = [];

  for (const market of markets as Array<Record<string, unknown>>) {
    try {
      const tokens = market.tokens as Array<{ token_id: string; outcome: string }> | undefined;
      const yesTokenId = tokens?.[0]?.token_id;
      const noTokenId = tokens?.[1]?.token_id;
      if (!yesTokenId || !noTokenId) continue;
      if (market.closed || market.resolved) continue;
      const volume = Number(market.volume ?? 0);
      if (volume < minVolumeUsdc) continue;

      // Fetch order books in parallel
      const [yesBook, noBook] = await Promise.all([
        clob.getOrderBook(yesTokenId),
        clob.getOrderBook(noTokenId),
      ]);

      const yesAsk = yesBook.asks.length > 0 ? parseFloat(yesBook.asks[0].price) : 1;
      const noAsk = noBook.asks.length > 0 ? parseFloat(noBook.asks[0].price) : 1;

      if (yesAsk <= 0 || yesAsk >= 1 || noAsk <= 0 || noAsk >= 1) continue;

      const totalCost = yesAsk + noAsk;
      if (totalCost < threshold) {
        const lockedProfit = 1 - totalCost;
        opportunities.push({
          market: market.question as string,
          conditionId: market.conditionId as string,
          yesAsk,
          noAsk,
          totalCost,
          lockedProfit,
        });
      }
    } catch (err) {
      // Skip market on any error
      continue;
    }
  }

  // Sort by locked profit descending
  opportunities.sort((a, b) => b.lockedProfit - a.lockedProfit);

  console.log(`Found ${opportunities.length} opportunities:\n`);
  for (const opp of opportunities.slice(0, 20)) {
    console.log(`[${opp.conditionId}] ${opp.market.substring(0, 60)}`);
    console.log(`  YES ask: ${opp.yesAsk.toFixed(4)} | NO ask: ${opp.noAsk.toFixed(4)}`);
    console.log(`  Total cost: ${opp.totalCost.toFixed(4)} | Locked profit: ${opp.lockedProfit.toFixed(4)}`);
    console.log();
  }
}

// Standalone execution if run directly
if (require.main === module) {
  const program = new Command();
  program
    .name('neg-risk-scan')
    .description('Scan for negative risk arbitrage opportunities')
    .option('--threshold <t>', 'Sum threshold (e.g., 0.98)', '0.98')
    .option('--minVolume <v>', 'Minimum market volume (USDC)', '1000')
    .option('--maxSize <s>', 'Max opportunity size per leg (USDC)', '10')
    .action(async (opts) => {
      try {
        await runNegRiskScan({
          threshold: parseFloat(opts.threshold),
          minVolumeUsdc: parseFloat(opts.minVolume),
          maxOpportunitySizeUsdc: parseFloat(opts.maxSize),
        });
      } catch (err) {
        console.error('Error:', (err as Error).message);
        process.exit(1);
      }
    });
  program.parse();
}
