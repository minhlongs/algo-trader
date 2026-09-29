/**
 * MARL:AUTO Command — Autonomous Market-Making & Delta-Neutral Liquidity Engine
 *
 * Runs competitive Avellaneda-Stoikov quoting agents, real-time inventory skew control,
 * adverse selection defenses (VPIN & Kyle's Lambda), and atomic delta hedging.
 */

import { MarlEngine } from '../marl/engine/marl-engine';
import { type MarlEngineConfig } from '../marl/engine/marl-engine-types';
import { AvellanedaStoikovConfigSchema } from '../marl/types/marl-config-types';
import { MarlRiskConfigSchema } from '../marl/risk/marl-risk-types';
import { logger } from '../../shared/utils/logger';

export interface MarlAutoCommandOptions {
  symbol?: string;
  dryRun?: boolean;
  verbose?: boolean;
  capital?: number;
  gamma?: number;
  sigma?: number;
  quoteSize?: number;
  durationSeconds?: number;
}

export interface MarlAutoRunResult {
  engine: MarlEngine;
  quotesGenerated: number;
  status: ReturnType<MarlEngine['getStatus']>;
}

export async function runMarlAuto(options: MarlAutoCommandOptions = {}): Promise<MarlAutoRunResult> {
  const symbol = options.symbol ?? 'BTC/USDT';
  const dryRun = options.dryRun ?? true;
  const verbose = options.verbose ?? true;
  const capital = options.capital ?? 100_000;
  const gamma = options.gamma ?? 0.1;
  const sigma = options.sigma ?? 0.3;
  const quoteSize = options.quoteSize ?? 10;
  const durationSec = options.durationSeconds ?? 0;

  if (verbose) {
    logger.info('⚡ MARL:AUTO — Multi-Agent Reinforcement Learning Market-Maker');
    logger.info(`  Symbol: ${symbol} | Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'} | Capital: $${capital}`);
    logger.info(`  Gamma: ${gamma} | Sigma: ${sigma} | Quote Size: ${quoteSize}`);
  }

  const engineConfig: Partial<MarlEngineConfig> = {
    symbol,
    asConfig: AvellanedaStoikovConfigSchema.parse({
      gamma,
      sigma,
      quoteSize,
    }),
    riskConfig: MarlRiskConfigSchema.parse({
      maxPositionFraction: 0.05,
      maxInventoryNotionalUsd: 50_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
    }),
  };

  const engine = new MarlEngine(engineConfig);
  engine.setPortfolioCapital(capital);
  engine.start();

  let quotesGenerated = 0;
  const quote = engine.generateQuote(0.50);
  if (quote) {
    quotesGenerated++;
    if (verbose) {
      logger.info('[MARL:AUTO] Optimal Quote Generated', {
        bid: quote.bidPrice,
        ask: quote.askPrice,
        spread: quote.totalSpread,
        multiplier: quote.wideningMultiplier,
      });
    }
  }

  if (durationSec > 0) {
    logger.info(`[MARL:AUTO] Running engine loop for ${durationSec}s`);
    await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));
    engine.stop();
  }

  return {
    engine,
    quotesGenerated,
    status: engine.getStatus(),
  };
}
