/**
 * Strategy Runner Types
 *
 * Type definitions and GammaClient implementation for the strategy runner module.
 */

import type { GammaClient, GammaMarket } from '../polymarket/gamma-client';
import type { StrategyName } from '../core/types';
import type { BasePolymarketStrategy, BaseStrategyConfig, StrategyDeps } from '@desk/strategies/polymarket/base-polymarket-strategy';
import type { FeeScheduleResolver } from './fee-schedule-resolver';
import type { LiveTradingConfig } from './live-trading-orchestrator';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RunnerStrategyDeps extends StrategyDeps {
  feeResolver?: FeeScheduleResolver;
}

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
  /** Optional dependency overrides (clob, gamma, eventBus, feeResolver) for testing / shadow feed injection */
  deps?: Partial<RunnerStrategyDeps>;
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

function parseStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((item) => String(item));
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      return [];
    }
  }
  return [];
}

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
    return events.map((e) => {
      const rawMarkets = Array.isArray(e['markets']) ? (e['markets'] as Array<Record<string, unknown>>) : [];
      return {
        id: String(e['id'] ?? ''),
        title: String(e['title'] ?? ''),
        slug: String(e['slug'] ?? ''),
        markets: this.mapMarkets(rawMarkets),
      };
    });
  }

  private mapMarkets(data: Array<Record<string, unknown>>): GammaMarket[] {
    return data.map((m) => this.mapMarket(m));
  }

  private mapMarket(m: Record<string, unknown>): GammaMarket {
    const rawTokens = Array.isArray(m['tokens']) ? (m['tokens'] as Array<Record<string, unknown>>) : [];
    const outcomes = parseStringArray(m['outcomes']);
    const outcomePrices = parseStringArray(m['outcomePrices']);
    const clobTokenIds = parseStringArray(m['clobTokenIds']);
    const yesToken = rawTokens.find((t) => t['outcome'] === 'Yes');
    const noToken = rawTokens.find((t) => t['outcome'] === 'No');
    const yesTokenId = (yesToken?.['token_id'] as string | undefined) ?? clobTokenIds[0] ?? '';
    const noTokenId = (noToken?.['token_id'] as string | undefined) ?? clobTokenIds[1];
    const yesPrice = Number(yesToken?.['price'] ?? outcomePrices[0]) || 0;
    const noPrice = Number(noToken?.['price'] ?? outcomePrices[1]) || Math.max(0, 1 - yesPrice);
    const synthesizedTokens = rawTokens.length > 0
      ? rawTokens.map((t) => ({
          token_id: String(t['token_id'] ?? ''),
          outcome: String(t['outcome'] ?? ''),
          price: Number(t['price']) || 0,
        }))
      : [
          ...(yesTokenId ? [{ token_id: yesTokenId, outcome: outcomes[0] ?? 'Yes', price: yesPrice }] : []),
          ...(noTokenId ? [{ token_id: noTokenId, outcome: outcomes[1] ?? 'No', price: noPrice }] : []),
        ];
    const rawVol24h = m['volume24hr'] ?? m['volume24h'];
    // Gamma publishes the neg-risk flag under two names depending on the endpoint.
    // `resolved` is only mapped when the payload carries it — an absent field must
    // stay absent so a strategy can tell "not resolved" from "we never checked".
    const rawNegRisk = m['negRisk'] ?? m['enableNegRisk'];
    const rawResolved = m['resolved'];

    return {
      id: m['id'] as string,
      conditionId: m['conditionId'] as string,
      question: m['question'] as string,
      slug: m['slug'] as string,
      outcomes: outcomes.length > 0 ? outcomes : (m['outcomes'] as string[]),
      outcomePrices: outcomePrices.length > 0 ? outcomePrices : (m['outcomePrices'] as string[]),
      active: m['active'] as boolean,
      closed: m['closed'] as boolean,
      volume: Number(m['volumeNum'] ?? m['volume']) || 0,
      ...(rawVol24h !== undefined ? { volume24h: Number(rawVol24h) || 0 } : {}),
      liquidity: Number(m['liquidityNum'] ?? m['liquidity']) || 0,
      endDate: (m['end_date_iso'] ?? m['endDate']) as string,
      tokens: synthesizedTokens,
      yesTokenId,
      noTokenId,
      yesPrice,
      ...(rawNegRisk !== undefined ? { negRisk: Boolean(rawNegRisk) } : {}),
      ...(rawResolved !== undefined ? { resolved: Boolean(rawResolved) } : {}),
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
