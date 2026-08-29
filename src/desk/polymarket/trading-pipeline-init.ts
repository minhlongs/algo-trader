// TradingPipeline — component init + strategy discovery/registration.
// Extracted from trading-pipeline.ts. Bodies moved verbatim; only `this.` → `ctx.`.
// Structural ctx interface (public fields) avoids facade→leaf→facade import cycle.
import { clobClient as clobClientSingleton, type ClobClientInterface } from './clob-client';
import { OrderBookStream } from './orderbook-stream';
import { MarketScanner } from './market-scanner';
import { OrderManager } from './order-manager';
import { CrossMarketArbStrategy } from '../../strategies/polymarket/cross-market-arb';
import { MarketMakerStrategy } from '../../strategies/polymarket/market-maker';
import { StrategyRunner } from '../../engine/strategy-runner';
import { TradeExecutor } from '../../engine/trade-executor';
import { RiskGateManager, EquitySnapshotManager } from '../risk';
import { LiveExecutionGuard } from '../execution/live-execution-guard';
import { getDatabase } from '../data/database';
import { buildPolymarketAdapter } from '../execution/polymarket-execution-adapter';
import { PredictionLoop } from './prediction-loop';
import { PredictionExecutor } from './prediction-executor';
import { MeanReversionStrategy } from '../../strategies/polymarket/mean-reversion';
import { logger } from '../core/logger';
import { tradingEventBus, type TradingEventBus } from '../../events/trading-event-bus';
import type { PipelineConfig, PipelineStatus } from './trading-pipeline-types';

/** Structural view of the TradingPipeline facade that init/prediction leaves need. */
export interface TradingPipelineCtx {
  status: PipelineStatus;
  cfg: Required<PipelineConfig>;
  clobClient: ClobClientInterface;
  orderbookStream: OrderBookStream;
  scanner: MarketScanner;
  orderManager: OrderManager;
  strategyRunner: StrategyRunner;
  eventBus: TradingEventBus;
  riskGateManager: RiskGateManager;
  equitySnapshotManager: EquitySnapshotManager;
  liveExecutionGuard: LiveExecutionGuard;
  predictionLoop: PredictionLoop | null;
  predictionExecutor: PredictionExecutor | null;
  meanReversion: MeanReversionStrategy | null;
  _priceUpdateCleanup?: (() => void);
}

export function initComponentsFor(ctx: TradingPipelineCtx): void {
  const db = getDatabase(ctx.cfg.dbPath);

  // Initialize the event bus first (singleton, but we keep a reference)
  ctx.eventBus = tradingEventBus;

  // Resolve private key from config first, then env var, fallback to 'paper-key' for paper mode
  const resolvedKey = ctx.cfg.privateKey
    || process.env['POLYMARKET_PRIVATE_KEY']
    || process.env['POLY_PRIVATE_KEY']
    || 'paper-key';

  ctx.clobClient      = clobClientSingleton;
  ctx.orderbookStream = new OrderBookStream(ctx.eventBus);
  ctx.scanner         = new MarketScanner(ctx.clobClient);
  ctx.orderManager    = new OrderManager(ctx.clobClient);
  ctx.strategyRunner  = new StrategyRunner();

  const capitalUsdc = parseFloat(ctx.cfg.capitalUsdc);

  // Wire real risk gate: LiveExecutionGuard → RiskGateManager
  ctx.liveExecutionGuard = new LiveExecutionGuard({ capitalUsdc });
  ctx.riskGateManager = new RiskGateManager(ctx.liveExecutionGuard);
  ctx.equitySnapshotManager = new EquitySnapshotManager();

  const { adapter } = buildPolymarketAdapter({
    paperTrading: ctx.cfg.paperTrading,
    chainId:      ctx.cfg.chainId,
  });

  // TradeExecutor wired but strategies call ClobClient directly (adapter used for risk gate)
  new TradeExecutor({ polymarket: adapter });
  ctx.orderManager.startStalePoll();
}

export async function discoverAndRegisterStrategiesFor(ctx: TradingPipelineCtx): Promise<void> {
  logger.info('Scanning for market opportunities', 'TradingPipeline');
  const scan = await ctx.scanner.scan({ minVolume: 1_000 });
  logger.info('Scan complete', 'TradingPipeline', { opportunities: scan.opportunities.length });

  // Subscribe top 20 tokens to live orderbook stream
  scan.opportunities.slice(0, 20).forEach(opp => {
    ctx.orderbookStream.subscribe(opp.yesTokenId);
    ctx.orderbookStream.subscribe(opp.noTokenId);
  });

  // Register arb strategy
  const arbCfg = ctx.cfg.strategies.find(s => s.name === 'cross-market-arb');
  if (arbCfg?.enabled) {
    const arb = new CrossMarketArbStrategy(ctx.clobClient, ctx.scanner, arbCfg, arbCfg.capitalAllocation);
    ctx.strategyRunner.register('cross-market-arb', arb);
  }

  // Register market maker and seed top markets
  const mmCfg = ctx.cfg.strategies.find(s => s.name === 'market-maker');
  if (mmCfg?.enabled) {
    const mm = new MarketMakerStrategy(ctx.clobClient, mmCfg, mmCfg.capitalAllocation);
    scan.opportunities.slice(0, 10).forEach(opp => mm.addMarket(opp));
    ctx.strategyRunner.register('market-maker', mm);
  }

  // Layer 3: Mean Reversion
  const mrCfg = ctx.cfg.strategies.find(s => s.name === 'mean-reversion');
  if (mrCfg?.enabled !== false) {
    const mrCapital = mrCfg?.capitalAllocation ?? '200';
    ctx.meanReversion = new MeanReversionStrategy(
      ctx.clobClient, ctx.scanner,
      mrCfg ?? { name: 'mean-reversion', enabled: true, capitalAllocation: mrCapital, params: {} },
      mrCapital,
    );
    ctx.strategyRunner.register('mean-reversion', ctx.meanReversion);
  }
}
