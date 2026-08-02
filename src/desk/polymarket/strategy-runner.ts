/**
 * Strategy Runner
 *
 * Wires a V2 Polymarket strategy to the live trading pipeline end-to-end.
 * Handles orchestrator lifecycle, Gamma market fetching, strategy execution
 * via TradingEventBus price updates, and graceful shutdown.
 *
 * Supports any strategy extending BasePolymarketStrategy — just pass the class
 * reference and config.
 *
 * Usage:
 * const runner = new StrategyRunner(SpreadMeanReversionStrategy, {
 *   strategyConfig: DEFAULT_CONFIG,
 *   tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
 * });
 * await runner.start();
 * // ... executes reactively on PRICE_UPDATE events ...
 * await runner.stop();
 */

import type { GammaClient, GammaMarket } from '../polymarket/gamma-client';
import type { StrategyName } from '../core/types';
import type { BasePolymarketStrategy, BaseStrategyConfig, StrategyDeps } from '@desk/strategies/polymarket/base-polymarket-strategy';
import type { LivePosition } from '@desk/execution/live-position-tracker';
import { StrategyLiveBridge } from './strategy-live-bridge';
import { LiveOrderManagerProxy } from './live-order-manager-proxy';
import { LiveTradingOrchestrator, type LiveTradingConfig } from './live-trading-orchestrator';
import { logger } from '@shared/utils/logger';
import { TradingEventBus, PriceUpdatePayload, tradingEventBus } from '../events/trading-event-bus';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StrategyRunnerConfig {
  /** Strategy-specific config (passed to strategy constructor) */
  strategyConfig: BaseStrategyConfig;
  /** Live trading config (orchestrator) */
  tradingConfig: LiveTradingConfig;
  /** Tick interval in ms — starts a polling timer that fires synthetic PRICE_UPDATE events */
  tickIntervalMs?: number;
  /** Max ticks before auto-stop (0 = unlimited) */
  maxTicks?: number;
  /** Max execution frequency per strategy (ms) - prevents event storm choking */
  minExecutionIntervalMs?: number;
  /** Auto-start endgame scanner (default: false) */
  autoScan?: boolean;
}

export interface RunnerStatus {
  status: 'stopped' | 'running' | 'error';
  strategyName: string;
  mode: 'PAPER' | 'LIVE';
  executionCount: number;
  /** @deprecated Use executionCount instead */
  tickCount: number;
  positions: LivePosition[];
  bridgeStats: ReturnType<StrategyLiveBridge['getStats']>;
  proxyStats: ReturnType<LiveOrderManagerProxy['getStats']>;
}

// ── Gamma Client Implementation ────────────────────────────────────────────────

class GammaClientImpl implements GammaClient {
  private baseUrl = 'https://gamma-api.polymarket.com';

  async getMarkets(params?: { limit?: number; active?: boolean }): Promise<GammaMarket[]> {
    const limit = params?.limit ?? 100;
    const resp = await fetch(`${this.baseUrl}/markets?closed=false&limit=${limit}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) throw new Error(`Gamma API error ${resp.status}`);
    return this.mapMarkets(await resp.json() as Array<Record<string, unknown>>);
  }

  async getMarket(conditionId: string): Promise<GammaMarket | null> {
    const resp = await fetch(`${this.baseUrl}/markets?conditionId=${conditionId}&limit=1`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as Array<Record<string, unknown>>;
    return data.length > 0 ? this.mapMarket(data[0]) : null;
  }

  async getMarketGroup(_groupId: string): Promise<{ id: string; title: string; slug: string; markets: GammaMarket[] } | null> {
    throw new Error('getMarketGroup not implemented');
  }

  async searchMarkets(query: string): Promise<GammaMarket[]> {
    const resp = await fetch(`${this.baseUrl}/markets?tag=${encodeURIComponent(query)}&limit=50`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return [];
    return this.mapMarkets(await resp.json() as Array<Record<string, unknown>>);
  }

  async getTrending(limit = 15): Promise<GammaMarket[]> {
    return this.getMarkets({ limit, active: true });
  }

  async getEvents(limit = 10): Promise<Array<{ id: string; title: string; slug: string; markets: GammaMarket[] }>> {
    const resp = await fetch(`${this.baseUrl}/events?limit=${limit}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return [];
    const events = await resp.json() as Array<Record<string, unknown>>;
    return Promise.all(
      events.map(async (e) => ({
        id: e['id'] as string,
        title: e['title'] as string,
        slug: e['slug'] as string,
        markets: [],
      })),
    );
  }

  private mapMarkets(data: Array<Record<string, unknown>>): GammaMarket[] {
    return data.map((m) => this.mapMarket(m));
  }

  private mapMarket(m: Record<string, unknown>): GammaMarket {
    const tokens = m['tokens'] as Array<Record<string, unknown>> | undefined;
    const yesToken = (tokens ?? []).find((t) => t['outcome'] === 'Yes');
    const noToken = (tokens ?? []).find((t) => t['outcome'] === 'No');
    const prices = JSON.parse((m['outcomePrices'] as string) ?? '["0","0"]') as string[];

    return {
      id: m['id'] as string,
      question: m['question'] as string,
      conditionId: m['conditionId'] as string,
      slug: m['slug'] as string,
      outcomes: (m['outcomes'] as string[]) ?? [],
      outcomePrices: prices,
      volume: Number(m['volume'] ?? 0),
      liquidity: Number(m['liquidity'] ?? 0),
      endDate: m['endDate'] as string,
      active: Boolean(m['active']),
      closed: Boolean(m['closed']),
      tokens: (tokens ?? []).map((t) => ({
        token_id: t['token_id'] as string,
        outcome: t['outcome'] as string,
        price: Number(t['price'] ?? 0),
      })),
      yesTokenId: (yesToken?.['token_id'] ?? `${m['id']}-yes`) as string,
      noTokenId: noToken?.['token_id'] as string | undefined,
      yesPrice: parseFloat(prices[0] ?? '0'),
    };
  }
}

// ── Runner ─────────────────────────────────────────────────────────────────────

type StrategyConstructor = new (deps: StrategyDeps, config: any, name: StrategyName) => BasePolymarketStrategy;

export class StrategyRunner {
  private strategyClass: StrategyConstructor;
  private config: StrategyRunnerConfig;
  private orchestrator: LiveTradingOrchestrator;
  private bridge: StrategyLiveBridge | null = null;
  private proxy: LiveOrderManagerProxy | null = null;
  private gammaClient: GammaClient;
  private strategy: BasePolymarketStrategy | null = null;
  private executionCount = 0;
  private status: RunnerStatus['status'] = 'stopped';
  private strategyName: string;
  private ownsOrchestrator: boolean;

  // Event-driven execution
  private eventBus: TradingEventBus;
  private trackedTokenIds = new Set<string>();
  private lastExecutionTime = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(
    strategyClass: StrategyConstructor,
    config: StrategyRunnerConfig,
    externalOrchestrator?: LiveTradingOrchestrator
  ) {
    this.strategyClass = strategyClass;
    this.strategyName = strategyClass.name
      .replace(/Strategy$/, '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
    this.config = {
      minExecutionIntervalMs: 50,
      autoScan: false,
      ...config,
    };

    // Use external orchestrator if provided (multi-strategy mode), else create own
    this.ownsOrchestrator = externalOrchestrator === undefined;
    this.orchestrator = externalOrchestrator ?? new LiveTradingOrchestrator(config.tradingConfig);
    this.gammaClient = new GammaClientImpl();

    // Use shared TradingEventBus singleton
    this.eventBus = tradingEventBus;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'running';

    // If orchestrator was provided externally, don't start it (already started by owner)
    if (this.orchestrator.getStatus() !== 'running') {
      await this.orchestrator.start();
    }

    // Wire bridge + proxy
    this.bridge = new StrategyLiveBridge(this.orchestrator);
    this.proxy = new LiveOrderManagerProxy(this.bridge, this.strategyName);

    // Create strategy instance with live-trading-wired deps
    const deps: StrategyDeps = {
      clob: null as unknown as StrategyDeps['clob'],
      orderManager: this.proxy,
      eventBus: this.createNoopEventBus(),
      gamma: this.gammaClient,
    };

    this.strategy = new this.strategyClass(
      deps,
      this.config.strategyConfig,
      this.strategyName as StrategyName,
    );

    // Subscribe to price updates for tokens this strategy tracks
    this.subscribeToPriceUpdates();

    // Start tick timer if interval configured — polls strategy.execute() at the given cadence
    if (this.config.tickIntervalMs && this.config.tickIntervalMs > 0) {
      this.tickTimer = setInterval(() => this.tick(), this.config.tickIntervalMs);
      this.tickTimer.unref();
    }

    // Start health check heartbeat (safety fallback - every 60s)
    this.startHealthCheckHeartbeat();

    logger.info('Strategy runner started (event-driven)', 'StrategyRunner', {
      strategy: this.strategyName,
      mode: this.orchestrator.getMode(),
      minExecutionIntervalMs: this.config.minExecutionIntervalMs,
    });
  }

  async stop(): Promise<void> {
    this.status = 'stopped';
    this.unsubscribeFromPriceUpdates();
    this.stopHealthCheckHeartbeat();
    this.stopTickTimer();

    // Only stop orchestrator if we own it (not shared across strategies)
    if (this.ownsOrchestrator) {
      await this.orchestrator.stop();
    }

    logger.info('Strategy runner stopped', 'StrategyRunner', {
      executions: this.executionCount,
    });
  }

  // ── Event Bus Subscription ───────────────────────────────────────────────────

  /** Subscribe to PRICE_UPDATE events from TradingEventBus.
   *  Filters updates by tokenId and triggers strategy execution. */
  private subscribeToPriceUpdates(): void {
    const handler = this.handlePriceUpdate.bind(this);
    this.eventBus.on('PRICE_UPDATE', handler);
    // Store reference for cleanup
    (this as any)._priceUpdateHandler = handler;
  }

  private unsubscribeFromPriceUpdates(): void {
    const handler = (this as any)._priceUpdateHandler;
    if (handler) {
      this.eventBus.off('PRICE_UPDATE', handler);
      (this as any)._priceUpdateHandler = null;
    }
  }

  /** Handle incoming PRICE_UPDATE event.
   *  Triggers strategy.execute() if the token matches a tracked position or entry candidate.
   *  Includes debouncing to prevent event storm choking. */
  private async handlePriceUpdate(payload: PriceUpdatePayload): Promise<void> {
    if (this.status !== 'running' || !this.strategy) return;

    // Debounce: prevent execution more than once per minExecutionIntervalMs
    const now = Date.now();
    if (now - this.lastExecutionTime < this.config.minExecutionIntervalMs!) {
      return;
    }

    // Check if this token is relevant to our strategy
    // Relevant if: we have an open position on it, or it's a trending market we might enter
    const isRelevant = this.trackedTokenIds.size === 0 || this.trackedTokenIds.has(payload.tokenId);

    if (!isRelevant) {
      return;
    }

    this.lastExecutionTime = now;

    try {
      this.executionCount++;
      await this.strategy.execute();

      if (this.config.maxTicks && this.executionCount >= this.config.maxTicks) {
        logger.info('Max ticks reached, auto-stopping', 'StrategyRunner', {
          strategy: this.strategyName,
          executions: this.executionCount,
          maxTicks: this.config.maxTicks,
        });
        await this.stop();
        return;
      }

      logger.debug('Reactive execution complete', 'StrategyRunner', {
        strategy: this.strategyName,
        execution: this.executionCount,
        triggerToken: payload.tokenId,
        triggerBid: payload.bid,
        triggerAsk: payload.ask,
      });
    } catch (err) {
      logger.error('Reactive execution error', 'StrategyRunner', {
        err: String(err),
        execution: this.executionCount,
      });
    }
  }

  /** Track a token ID for reactive execution triggers.
   *  Called when a position is opened or when the strategy identifies a market of interest. */
  trackToken(tokenId: string): void {
    this.trackedTokenIds.add(tokenId);
  }

  /** Stop tracking a token ID.
   *  Called when a position is closed and no longer relevant. */
  untrackToken(tokenId: string): void {
    this.trackedTokenIds.delete(tokenId);
  }

  // ── Tick Timer (Polling Fallback) ───────────────────────────────────────────

  /** Execute a single strategy tick.
   *  Adds a synthetic tracked token if none exist so handlePriceUpdate fires. */
  private async tick(): Promise<void> {
    if (this.status !== 'running' || !this.strategy) return;

    if (this.trackedTokenIds.size === 0) {
      this.trackedTokenIds.add('tick-trigger');
    }

    await this.handlePriceUpdate({
      tokenId: 'tick-trigger',
      bid: 0,
      ask: 0,
      timestamp: Date.now(),
    });
  }

  private stopTickTimer(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // ── Health Check Heartbeat (Safety Fallback) ────────────────────────────────

  /** Start a slow-frequency heartbeat (every 60s) for health checks.
   *  Does NOT trigger primary strategy execution - only logs status and
   *  verifies the runner is still alive. */
  private startHealthCheckHeartbeat(): void {
    this.healthCheckTimer = setInterval(() => this.healthCheck(), 60_000);
    this.healthCheckTimer.unref();
  }

  private stopHealthCheckHeartbeat(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private healthCheck(): void {
    if (this.status !== 'running') return;

    logger.debug('Strategy runner health check', 'StrategyRunner', {
      strategy: this.strategyName,
      status: this.status,
      executions: this.executionCount,
      trackedTokens: this.trackedTokenIds.size,
      positions: this.orchestrator.getPositions().length,
      orchestratorStatus: this.orchestrator.getStatus(),
    });
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  getStatus(): RunnerStatus {
    return {
      status: this.status,
      strategyName: this.strategyName,
      mode: this.orchestrator.getMode(),
      executionCount: this.executionCount,
      tickCount: this.executionCount, // deprecated alias for backward compat
      positions: this.orchestrator.getPositions(),
      bridgeStats: this.bridge?.getStats() ?? {
        scansCompleted: 0,
        signalsProcessed: 0,
        signalsRejected: 0,
        isScanning: false,
        scannerActive: false,
      },
      proxyStats: this.proxy?.getStats() ?? {
        strategy: this.strategyName,
        ordersPlaced: 0,
        cancelsRequested: 0,
        bridgeStats: {
          scansCompleted: 0,
          signalsProcessed: 0,
          signalsRejected: 0,
          isScanning: false,
          scannerActive: false,
        },
      },
    };
  }

  getOrchestrator(): LiveTradingOrchestrator {
    return this.orchestrator;
  }

  getBridge(): StrategyLiveBridge | null {
    return this.bridge;
  }

  getTrackedTokens(): string[] {
    return Array.from(this.trackedTokenIds);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private createNoopEventBus(): StrategyDeps['eventBus'] {
    return {
      emit: (_event: string, _data: unknown) => {},
      on: (_event: string, _handler: (...args: unknown[]) => void) => {},
      off: (_event: string, _handler: (...args: unknown[]) => void) => {},
    };
  }
}
