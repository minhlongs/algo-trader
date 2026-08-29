// Polymarket live trading pipeline: wires scanner → orderbook → strategies → risk → executor → DB
// Paper trading is the DEFAULT mode (safe). Set paperTrading: false for live execution.
// Facade: init/discovery + prediction-feed bodies live in trading-pipeline-init.ts /
// trading-pipeline-prediction.ts; leaves operate on the structural TradingPipelineCtx.
import { EventEmitter } from 'events';
import type { ClobClientInterface } from './clob-client';
import { OrderBookStream } from './orderbook-stream';
import { MarketScanner } from './market-scanner';
import { OrderManager } from './order-manager';
import { MarketMakerStrategy } from '../../strategies/polymarket/market-maker';
import { StrategyRunner } from '../../engine/strategy-runner';
import { RiskGateManager, EquitySnapshotManager } from '../risk';
import { LiveExecutionGuard } from '../execution/live-execution-guard';
import { PredictionLoop } from './prediction-loop';
import { PredictionExecutor } from './prediction-executor';
import { MeanReversionStrategy } from '../../strategies/polymarket/mean-reversion';
import { logger } from '../core/logger';
import type { TradingEventBus } from '../../events/trading-event-bus';
import {
  DEFAULT_CAPITAL,
  DEFAULT_DB_PATH,
  DEFAULT_STRATEGIES,
  type PipelineConfig,
  type PipelineStatus,
} from './trading-pipeline-types';
import { initComponentsFor, discoverAndRegisterStrategiesFor } from './trading-pipeline-init';
import {
  startPredictionFeedFor,
  initPredictionExecutorFor,
  recordEquitySnapshotFor,
  getMarketMakerInstanceFor,
} from './trading-pipeline-prediction';

// ── Facade re-exports (importers compile UNMODIFIED) ───────────────────────────
export type { PipelineConfig, PipelineStatus } from './trading-pipeline-types';

/**
 * TradingPipeline: end-to-end orchestrator for Polymarket strategies.
 * ALL trade signals flow through RiskGateManager before execution.
 * Fields are public (not private) so the instance satisfies the structural
 * TradingPipelineCtx interface used by the leaf modules.
 */
export class TradingPipeline extends EventEmitter {
  status: PipelineStatus = 'stopped';
  cfg: Required<PipelineConfig>;

  clobClient!: ClobClientInterface;
  orderbookStream!: OrderBookStream;
  scanner!: MarketScanner;
  predictionLoop: PredictionLoop | null = null;
  predictionExecutor: PredictionExecutor | null = null;
  meanReversion: MeanReversionStrategy | null = null;
  orderManager!: OrderManager;
  strategyRunner!: StrategyRunner;
  eventBus!: TradingEventBus;
  riskGateManager!: RiskGateManager;
  equitySnapshotManager!: EquitySnapshotManager;
  liveExecutionGuard!: LiveExecutionGuard;
  _priceUpdateCleanup?: (() => void);

  constructor(config: PipelineConfig = {}) {
    super();
    this.cfg = {
      paperTrading: config.paperTrading ?? true,
      privateKey:   config.privateKey   ?? '',
      chainId:      config.chainId      ?? 137,
      capitalUsdc:  config.capitalUsdc  ?? DEFAULT_CAPITAL,
      dbPath:       config.dbPath       ?? DEFAULT_DB_PATH,
      strategies:   config.strategies   ?? DEFAULT_STRATEGIES,
    };
  }

  /** Start the full pipeline: scan → stream → strategies */
  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'starting';
    const mode = this.cfg.paperTrading ? '[PAPER]' : '[LIVE]';
    logger.info(`Starting trading pipeline ${mode}`, 'TradingPipeline');

    try {
      this.initComponents();
      await this.discoverAndRegisterStrategies();
      this.wireOrderbookStream();
      await this.strategyRunner.startAll(this.cfg.strategies);
      this.status = 'running';
      this.emit('started', { mode: this.cfg.paperTrading ? 'paper' : 'live' });
      logger.info(`Pipeline running ${mode}`, 'TradingPipeline');

      // Start AI prediction loop — feeds fair values to MarketMaker
      this.startPredictionFeed();
    } catch (err) {
      this.status = 'error';
      logger.error('Pipeline failed to start', 'TradingPipeline', { err: String(err) });
      this.emit('error', err);
      throw err;
    }
  }

  /** Gracefully stop all strategies and close connections */
  async stop(): Promise<void> {
    if (this.status === 'stopped') return;
    this.status = 'stopping';
    logger.info('Stopping trading pipeline', 'TradingPipeline');

    if (this.predictionLoop) {
      this.predictionLoop = null;
    }
    if (this.meanReversion) {
      await this.meanReversion.stop();
    }
    await this.strategyRunner.stopAll().catch(err =>
      logger.error('Error stopping strategies', 'TradingPipeline', { err: String(err) }),
    );

    // Cancel ALL open GTC orders before disconnecting — prevents stale fills after shutdown
    try {
      const cancelled = await this.orderManager.cancelAllOpen();
      if (cancelled > 0) {
        logger.info(`Cancelled ${cancelled} open orders during shutdown`, 'TradingPipeline');
      }
    } catch (err) {
      logger.error('Failed to cancel orders during shutdown', 'TradingPipeline', { err: String(err) });
    }

    // Cleanup event bus subscriptions
    if (this._priceUpdateCleanup) {
      this._priceUpdateCleanup();
    }

    this.orderManager.stopStalePoll();
    this.orderbookStream.disconnect();

    this.status = 'stopped';
    this.emit('stopped');
    logger.info('Pipeline stopped', 'TradingPipeline');
  }

  getStatus(): PipelineStatus { return this.status; }
  getStrategiesStatus() { return this.strategyRunner.getAllStatus(); }

  /** Expose risk gate for strategies that need pre-tick/order checks */
  getRiskGate(): RiskGateManager { return this.riskGateManager; }

  private wireOrderbookStream(): void {
    // Listen for connection status from OrderBookStream via event bus
    this.eventBus.onConnectionStatus((payload) => {
      if (payload.component === 'OrderBookStream' && payload.status === 'disconnected') {
        logger.warn('Orderbook stream disconnected', 'TradingPipeline');
        this.emit('stream_disconnected');
      }
    });

    // Feed price updates to mean reversion strategy (Layer 3) via event bus
    const cleanupPriceUpdates = this.eventBus.onPriceUpdate((data) => {
      if (this.meanReversion && data.bid > 0 && data.ask > 0) {
        this.meanReversion.onPriceUpdate(data.tokenId, (data.bid + data.ask) / 2);
      }
    });

    // Store cleanup function for potential shutdown
    this._priceUpdateCleanup = cleanupPriceUpdates;

    this.orderbookStream.connect();
    logger.info('Orderbook stream connected', 'TradingPipeline');
  }

  // ── Private: thin delegates to leaf modules ─────────────────────────────────

  private initComponents(): void {
    initComponentsFor(this);
  }

  private async discoverAndRegisterStrategies(): Promise<void> {
    await discoverAndRegisterStrategiesFor(this);
  }

  private startPredictionFeed(): void {
    startPredictionFeedFor(this);
  }

  private initPredictionExecutor(): void {
    initPredictionExecutorFor(this);
  }

  private async recordEquitySnapshot(): Promise<void> {
    await recordEquitySnapshotFor(this);
  }

  private getMarketMakerInstance(): MarketMakerStrategy | null {
    return getMarketMakerInstanceFor(this);
  }
}
