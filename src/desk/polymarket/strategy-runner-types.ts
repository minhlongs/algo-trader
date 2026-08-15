/**
 * Strategy Runner Types
 *
 * Type definitions and GammaClient implementation for the strategy runner module.
 */

import type { GammaClient, GammaMarket } from '../polymarket/gamma-client';
import type { StrategyName } from '../core/types';
import type { BasePolymarketStrategy, BaseStrategyConfig, StrategyDeps } from '@desk/strategies/polymarket/base-polymarket-strategy';
import type { LiveTradingConfig } from './live-trading-orchestrator';

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
  executionCount: number;
  trackedTokens: string[];
}

export type StrategyConstructor = new (deps: StrategyDeps, config: BaseStrategyConfig, name: StrategyName) => BasePolymarketStrategy;

// ── Default Config ─────────────────────────────────────────────────────────────

export const DEFAULT_RUNNER_CONFIG: Partial<StrategyRunnerConfig> = {
  tickIntervalMs: 30_000,
  maxTicks: 0,
  minExecutionIntervalMs: 50,
  autoScan: false,
};

// ── Gamma Client Implementation ────────────────────────────────────────────────

export class GammaClientImpl implements GammaClient {
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
    const tokens = (m['tokens'] as Array<Record<string, unknown>>) ?? [];
    const yesToken = tokens.find((t) => t['outcome'] === 'Yes');
    const noToken = tokens.find((t) => t['outcome'] === 'No');

    return {
      id: m['id'] as string,
      conditionId: m['conditionId'] as string,
      question: m['question'] as string,
      slug: m['slug'] as string,
      outcomes: m['outcomes'] as string[],
      outcomePrices: m['outcomePrices'] as string[],
      active: m['active'] as boolean,
      closed: m['closed'] as boolean,
      volume: Number(m['volume']) || 0,
      liquidity: Number(m['liquidity']) || 0,
      endDate: m['end_date_iso'] as string,
      tokens: tokens.map((t) => ({
        token_id: t['token_id'] as string,
        outcome: t['outcome'] as string,
        price: Number(t['price']) || 0,
      })),
      yesTokenId: yesToken?.['token_id'] as string ?? '',
      noTokenId: noToken?.['token_id'] as string,
      yesPrice: Number(yesToken?.['price']) || 0,
    };
  }
}

// ── Helper: Create Noop EventBus ───────────────────────────────────────────────

export function createNoopEventBus() {
  return {
    emit: (_event: string, _data: unknown) => {},
    on: (_event: string, _handler: (...args: unknown[]) => void) => {},
    off: (_event: string, _handler: (...args: unknown[]) => void) => {},
  };
}
