/**
 * Strategy Runner
 *
 * Wires a V2 Polymarket strategy to the live trading pipeline end-to-end.
 * Handles orchestrator lifecycle, Gamma market fetching, strategy tick loop,
 * and graceful shutdown.
 *
 * Supports any strategy extending BasePolymarketStrategy — just pass the class
 * reference and config.
 *
 * Usage:
 *   const runner = new StrategyRunner(SpreadMeanReversionStrategy, {
 *     strategyConfig: DEFAULT_CONFIG,
 *     tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
 *   });
 *   await runner.start();
 *   // ... ticks run automatically ...
 *   await runner.stop();
 */

import type { GammaClient, GammaMarket } from '../polymarket/gamma-client';
import type { } from '../polymarket/order-manager';
import type { StrategyName } from '../core/types';
import type { BasePolymarketStrategy, BaseStrategyConfig, StrategyDeps } from '../strategies/polymarket/base-polymarket-strategy';
import type { LivePosition } from '../execution/live-position-tracker';
import { StrategyLiveBridge } from './strategy-live-bridge';
import { LiveOrderManagerProxy } from './live-order-manager-proxy';
import { LiveTradingOrchestrator, type LiveTradingConfig } from './live-trading-orchestrator';
import { logger } from '../../shared/utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StrategyRunnerConfig {
  /** Strategy-specific config (passed to strategy constructor) */
  strategyConfig: BaseStrategyConfig;
  /** Live trading config (orchestrator) */
  tradingConfig: LiveTradingConfig;
  /** Tick interval in milliseconds (default: 15s) */
  tickIntervalMs?: number;
  /** Max ticks before auto-stop (0 = unlimited) */
  maxTicks?: number;
  /** Auto-start endgame scanner (default: false) */
  autoScan?: boolean;
}

export interface RunnerStatus {
  status: 'stopped' | 'running' | 'error';
  strategyName: string;
  mode: 'PAPER' | 'LIVE';
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
  private tickTimer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private status: RunnerStatus['status'] = 'stopped';
  private strategyName: string;
  private ownsOrchestrator: boolean;

  constructor(strategyClass: StrategyConstructor, config: StrategyRunnerConfig, externalOrchestrator?: LiveTradingOrchestrator) {
    this.strategyClass = strategyClass;
    // Derive strategy name from class name for display
    this.strategyName = strategyClass.name
      .replace(/Strategy$/, '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
    this.config = {
      tickIntervalMs: 15_000,
      maxTicks: 0,
      autoScan: false,
      ...config,
    };

    // Use external orchestrator if provided (multi-strategy mode), else create own
    this.ownsOrchestrator = externalOrchestrator === undefined;
    this.orchestrator = externalOrchestrator ?? new LiveTradingOrchestrator(config.tradingConfig);
    this.gammaClient = new GammaClientImpl();
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

    // Start tick loop
    this.scheduleTick();

    logger.info('Strategy runner started', 'StrategyRunner', {
      strategy: this.strategyName,
      mode: this.orchestrator.getMode(),
      tickInterval: this.config.tickIntervalMs,
    });
  }

  async stop(): Promise<void> {
    this.status = 'stopped';
    this.stopTicking();

    // Only stop orchestrator if we own it (not shared across strategies)
    if (this.ownsOrchestrator) {
      await this.orchestrator.stop();
    }

    logger.info('Strategy runner stopped', 'StrategyRunner', {
      ticks: this.tickCount,
    });
  }

  // ── Tick ─────────────────────────────────────────────────────────────────────

  private scheduleTick(): void {
    if (this.status !== 'running') return;
    this.tickTimer = setTimeout(() => this.runTick(), this.config.tickIntervalMs);
    this.tickTimer?.unref();
  }

  private async runTick(): Promise<void> {
    if (this.status !== 'running') return;

    try {
      this.tickCount++;
      await this.strategy!.execute();

      logger.debug('Tick complete', 'StrategyRunner', {
        tick: this.tickCount,
        orchestratorPositions: this.orchestrator.getPositions().length,
      });

      // Auto-stop after maxTicks
      if (this.config.maxTicks && this.config.maxTicks > 0 && this.tickCount >= this.config.maxTicks) {
        logger.info('Max ticks reached, auto-stopping', 'StrategyRunner', { ticks: this.tickCount });
        await this.stop();
        return;
      }
    } catch (err) {
      logger.error('Tick error', 'StrategyRunner', { err: String(err), tick: this.tickCount });
    }

    this.scheduleTick();
  }

  private stopTicking(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  getStatus(): RunnerStatus {
    return {
      status: this.status,
      strategyName: this.strategyName,
      mode: this.orchestrator.getMode(),
      tickCount: this.tickCount,
      positions: this.orchestrator.getPositions(),
      bridgeStats: this.bridge?.getStats() ?? {
        scansCompleted: 0, signalsProcessed: 0, signalsRejected: 0,
        isScanning: false, scannerActive: false,
      },
      proxyStats: this.proxy?.getStats() ?? {
        strategy: this.strategyName, ordersPlaced: 0, cancelsRequested: 0,
        bridgeStats: {
          scansCompleted: 0, signalsProcessed: 0, signalsRejected: 0,
          isScanning: false, scannerActive: false,
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

  // ── Private ─────────────────────────────────────────────────────────────────

  private createNoopEventBus(): StrategyDeps['eventBus'] {
    return {
      emit: (_event: string, _data: unknown) => {},
      on: (_event: string, _handler: (...args: unknown[]) => void) => {},
      off: (_event: string, _handler: (...args: unknown[]) => void) => {},
    };
  }
}
