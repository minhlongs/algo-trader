// TradingPipeline — AI prediction feed (Layer 1 fair values, Layer 2 directional,
// equity snapshots, MM registry lookup). Extracted from trading-pipeline.ts.
// Bodies moved verbatim; only `this.` → `ctx.`.
import { MarketMakerStrategy } from '../../strategies/polymarket/market-maker';
import { StrategyRunner } from '../../engine/strategy-runner';
import { PredictionLoop } from './prediction-loop';
import { PredictionExecutor } from './prediction-executor';
import { logger } from '../core/logger';
import type { TradingPipelineCtx } from './trading-pipeline-init';

/** Facade delegates the prediction feed loop calls back into. */
interface PredictionDelegates {
  initPredictionExecutor(): void;
  recordEquitySnapshot(): Promise<void>;
  getMarketMakerInstance(): MarketMakerStrategy | null;
}

export function startPredictionFeedFor(ctx: TradingPipelineCtx & PredictionDelegates): void {
  try {
    ctx.predictionLoop = new PredictionLoop(ctx.scanner);
    logger.info('PredictionLoop started — AI fair values feeding MarketMaker', 'TradingPipeline');

    // Layer 2: Setup directional executor if license available
    ctx.initPredictionExecutor();

    const feedLoop = async () => {
      while (ctx.status === 'running') {
        try {
          const signals = await ctx.predictionLoop!.runCycle();

          // Layer 1: Feed fair values to MM
          const mm = ctx.getMarketMakerInstance();
          if (mm) {
            for (const signal of signals) {
              if (signal.direction === 'skip') continue;
              mm.setFairValue(signal.yesTokenId, signal.ourProb, signal.confidence);
              logger.debug('Fed AI fair value to MM', 'TradingPipeline', {
                market: signal.description?.slice(0, 40),
                aiProb: signal.ourProb.toFixed(2),
                edge: (signal.edge * 100).toFixed(1) + '%',
              });
            }
          }

          // Layer 2: Execute directional bets on high-edge signals
          if (ctx.predictionExecutor) {
            const highEdge = signals.filter(s => s.direction !== 'skip' && Math.abs(s.edge) >= 0.08);
            if (highEdge.length > 0) {
              const trades = await ctx.predictionExecutor.executeSignals(highEdge);
              if (trades.length > 0) {
                logger.info(`Layer 2: Executed ${trades.length} directional trades`, 'TradingPipeline', {
                  totalUsdc: trades.reduce((s, t) => s + t.sizeUsdc, 0).toFixed(2),
                });
              }
            }
          }

          // Record equity snapshot (throttled to 1/min by manager)
          await ctx.recordEquitySnapshot();
        } catch (err) {
          logger.error('Prediction feed error', 'TradingPipeline', { err: String(err) });
        }
        await new Promise(r => setTimeout(r, 15 * 60 * 1000));
      }
    };
    feedLoop(); // fire and forget
  } catch (err) {
    logger.warn('PredictionLoop failed to start — MM will use midpoint (blind mode)', 'TradingPipeline', { err: String(err) });
  }
}

/** Layer 2: Initialize directional executor from env license */
export function initPredictionExecutorFor(ctx: TradingPipelineCtx): void {
  try {
    const key = process.env['RAAS_LICENSE_KEY'] || process.env['LICENSE_KEY'];
    const secret = process.env['RAAS_LICENSE_SECRET'] || process.env['LICENSE_SECRET'];
    if (!key || !secret) {
      logger.debug('No license key — Layer 2 (convergence) disabled', 'TradingPipeline');
      return;
    }
    // Minimal license payload for executor
    const capitalForDirectional = parseFloat(ctx.cfg.capitalUsdc) * 0.3;
    const license = { tier: 'pro', maxTradesPerDay: -1, features: [] };
    ctx.predictionExecutor = new PredictionExecutor(ctx.clobClient, license, {
      capitalUsdc: capitalForDirectional,
      maxPositionFraction: 0.05,
      kellyFraction: 0.25,
      dryRun: ctx.cfg.paperTrading,
    });
    logger.info(`Layer 2 (Convergence): $${capitalForDirectional} capital, quarter-Kelly`, 'TradingPipeline');
  } catch (err) {
    logger.warn('PredictionExecutor init failed', 'TradingPipeline', { err: String(err) });
  }
}

/** Record equity snapshot to PostgreSQL (throttled by manager) */
export async function recordEquitySnapshotFor(ctx: TradingPipelineCtx): Promise<void> {
  try {
    const capitalUsdc = parseFloat(ctx.cfg.capitalUsdc);
    const status = ctx.liveExecutionGuard.getStatus();
    const unrealized = status.dailyPnl;
    const ddPct = capitalUsdc > 0 ? Math.max(0, -unrealized / capitalUsdc) : 0;

    await ctx.equitySnapshotManager.record({
      totalEquity: capitalUsdc + unrealized,
      cashBalance: capitalUsdc - Math.abs(unrealized),
      unrealizedPnl: unrealized,
      realizedPnlDaily: status.dailyPnl,
      openPositions: status.openPositions,
      drawdownPct: ddPct,
    });
  } catch (err) {
    logger.debug('Equity snapshot failed (non-critical)', 'TradingPipeline', { err: String(err) });
  }
}

export function getMarketMakerInstanceFor(ctx: TradingPipelineCtx): MarketMakerStrategy | null {
  try {
    const runner = ctx.strategyRunner as StrategyRunner & { strategies: Map<string, unknown> };
    const strategies = (runner as StrategyRunner & { strategies: Map<string, unknown> }).strategies;
    if (strategies instanceof Map) {
      return (strategies.get('market-maker') as MarketMakerStrategy | undefined) ?? null;
    }
  } catch {
    // strategyRunner not yet initialised or registry shape mismatch — treat as absent
  }
  return null;
}
