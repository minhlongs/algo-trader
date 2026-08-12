/**
 * LlmTradingStrategy — LLM-assisted trade evaluation via OmniRoute gateway.
 *
 * Wires LlmRouter into the IStrategy interface so the existing routing
 * pipeline can call .execute() and receive BUY/SELL/HOLD signals produced
 * by Nemotron Nano (fastChat) and DeepSeek R1 (chat) through the
 * mandatory OmniRoute gateway at http://omnimbp.local:20128/v1.
 *
 * Two-tier evaluation:
 *   fastChat() — quick triage (~45 tok/s Nemotron Nano) → initial signal
 *   chat()      — deep reasoning (DeepSeek R1, ~10 tok/s) → confirmation
 *
 * If either provider is unavailable the strategy falls back to a
 * deterministic heuristic so the pipeline never stalls.
 */

import { LlmRouter, ChatMessage, RouterResponse } from '../lib/llm-router';
import { logger } from '../shared/utils/logger';
import type { IStrategy } from './types';

export interface LlmTradeSignal {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  latencyMs: number;
  provider: string;
}

export interface LlmTradingConfig {
  /** Symbol to evaluate, e.g. "BTC/USDT" */
  symbol: string;
  /** Confidence floor to emit a non-HOLD signal (0..1) */
  confidenceThreshold: number;
  /** Whether to run deep confirmation after fast triage */
  deepConfirm: boolean;
  /** Router instance — injected for testability */
  router?: LlmRouter;
}

export class LlmTradingStrategy implements IStrategy {
  readonly name = 'llm-assisted';
  private confidenceThreshold: number;
  private symbol: string;
  private deepConfirm: boolean;
  private router: LlmRouter;

  constructor(cfg: LlmTradingConfig) {
    this.symbol = cfg.symbol;
    this.confidenceThreshold = cfg.confidenceThreshold ?? 0.55;
    this.deepConfirm = cfg.deepConfirm ?? true;
    this.router = cfg.router ?? new LlmRouter();
  }

  getStatus(): Record<string, unknown> {
    return {
      strategy: this.name,
      symbol: this.symbol,
      confidenceThreshold: this.confidenceThreshold,
      deepConfirm: this.deepConfirm,
      gateway: 'http://omnimbp.local:20128/v1',
    };
  }

  /**
   * Evaluate a trade signal using LLM providers via OmniRoute.
   *
   * @param marketData — must contain at minimum:
   *   - price: current price (number)
   *   - priceChangePct: 24h change % (number)
   *   - volume: 24h volume (number)
   *   - rsi: RSI value 0..100 (number, optional)
   *   - emaShort / emaLong: moving averages (number, optional)
   */
  async execute(
    marketData: Record<string, unknown>,
  ): Promise<{ signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; metadata?: Record<string, unknown> }> {
    const price = Number(marketData.price ?? 0);
    const changePct = Number(marketData.priceChangePct ?? 0);
    const volume = Number(marketData.volume ?? 0);
    const rsi = Number(marketData.rsi ?? 50);
    const emaShort = Number(marketData.emaShort ?? price);
    const emaLong = Number(marketData.emaLong ?? price);

    // Build compact context for the LLM
    const context = this.buildContext(price, changePct, volume, rsi, emaShort, emaLong);

    let fastResult: LlmTradeSignal | null = null;
    let deepResult: LlmTradeSignal | null = null;

    // Tier 1: fast triage via Nemotron Nano (~45 tok/s)
    try {
      fastResult = await this.evaluateFast(context);
    } catch (err) {
      // Provider down — strategy stays alive, no throw
      logger.warn('[LlmTradingStrategy] fastChat failed', { symbol: this.symbol, error: (err as Error).message });
    }

    // Tier 2: deep confirmation via DeepSeek R1 (if enabled and fast signal is actionable)
    if (this.deepConfirm && fastResult && fastResult.signal !== 'HOLD') {
      try {
        deepResult = await this.evaluateDeep(context, fastResult);
      } catch (err) {
        // Deep confirmation failed — keep fastResult signal as-is
      }
    }

    // Combine tiers: deep confirmation overrides fast signal if available
    let combinedSignal = deepResult ?? fastResult ?? this.heuristicFallback(changePct, rsi, emaShort, emaLong);

    // Apply confidence threshold — suppress actionable signal if belief is weak
    if (combinedSignal.signal !== 'HOLD' && combinedSignal.confidence < this.confidenceThreshold) {
      combinedSignal = {
        signal: 'HOLD',
        confidence: combinedSignal.confidence,
        reasoning: `${combinedSignal.reasoning} (suppressed: conf ${combinedSignal.confidence.toFixed(2)} < threshold ${this.confidenceThreshold})`,
        latencyMs: combinedSignal.latencyMs,
        provider: combinedSignal.provider,
      };
    }

    const provider = combinedSignal.provider;

    return {
      signal: combinedSignal.signal,
      confidence: combinedSignal.confidence,
      metadata: {
        strategy: this.name,
        symbol: this.symbol,
        reasoning: combinedSignal.reasoning,
        provider,
        latencyMs: combinedSignal.latencyMs,
        gateway: 'http://omnimbp.local:20128/v1',
        marketSnapshot: { price, changePct, rsi, emaShort, emaLong },
        hadDeepConfirm: !!deepResult,
        tiers: {
          fast: fastResult ? { signal: fastResult.signal, confidence: fastResult.confidence } : null,
          deep: deepResult
            ? { signal: deepResult.signal, confidence: deepResult.confidence }
            : null,
        },
      },
    };
  }

  async initialize(): Promise<void> {
    // Warm up router health cache on startup
    try {
      await this.router.chat({
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 4,
      });
    } catch {
      // First ping may fail if providers are still booting — acceptable
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildContext(
    price: number,
    changePct: number,
    volume: number,
    rsi: number,
    emaShort: number,
    emaLong: number,
  ): string {
    const trend = emaShort > emaLong ? 'bullish' : emaShort < emaLong ? 'bearish' : 'neutral';
    const rsiZone = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral';
    return `${this.symbol} | price=${price.toFixed(2)} change24h=${changePct.toFixed(2)}% ` +
      `volume=${volume.toFixed(0)} RSI=${rsi.toFixed(1)} (${rsiZone}) ` +
      `EMA short=${emaShort.toFixed(2)} long=${emaLong.toFixed(2)} (${trend})`;
  }

  private async evaluateFast(context: string): Promise<LlmTradeSignal> {
    const systemPrompt =
      'You are a fast trade triage assistant. Output STRICTLY one of: BUY / SELL / HOLD ' +
      'then a 1-sentence reason. Confidence 0..1. Format: SIGNAL|CONFIDENCE|REASON';
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Market: ${context}. Signal?` },
    ];

    const res = await this.router.fastChat({ messages, maxTokens: 32, temperature: 0.1 });
    return this.parseSignal(res, 'nemotron-fast');
  }

  private async evaluateDeep(
    context: string,
    fast: LlmTradeSignal,
  ): Promise<LlmTradeSignal> {
    const systemPrompt =
      'You are a deep trading analyst. The fast triage signal is included. ' +
      'Confirm or override it. Output: CONFIRM_BUY / CONFIRM_SELL / OVERRIDE_HOLD / OVERRIDE_BUY / OVERRIDE_SELL ' +
      '|CONFIDENCE|ONE_LINE_REASON';
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Market: ${context}\nFast signal: ${fast.signal} (conf ${fast.confidence.toFixed(2)})\n${fast.reasoning}\nDeep analysis?` },
    ];

    const res = await this.router.chat({ messages, maxTokens: 64, temperature: 0.1 });
    return this.parseDeepSignal(res, fast, 'deepseek-r1');
  }

  private parseSignal(res: RouterResponse, provider: string): LlmTradeSignal {
    const parts = res.content.split('|').map((s) => s.trim());
    const rawSignal = (parts[0] ?? 'HOLD').toUpperCase();
    const signal = rawSignal === 'BUY' || rawSignal === 'SELL' ? rawSignal : 'HOLD';
    const confidence = Math.max(0.1, Math.min(1, Number(parts[1]) ?? 0.5));
    const reasoning = parts[2] ?? res.content.slice(0, 120);

    return {
      signal,
      confidence,
      reasoning,
      latencyMs: res.latencyMs,
      provider,
    };
  }

  private parseDeepSignal(
    res: RouterResponse,
    fast: LlmTradeSignal,
    provider: string,
  ): LlmTradeSignal {
    const parts = res.content.split('|').map((s) => s.trim());
    const raw = (parts[0] ?? 'CONFIRM_HOLD').toUpperCase();

    let signal: 'BUY' | 'SELL' | 'HOLD';
    if (raw.startsWith('CONFIRM')) {
      signal = fast.signal;
    } else if (raw.startsWith('OVERRIDE')) {
      const override = raw.replace('OVERRIDE_', '');
      signal = override === 'BUY' || override === 'SELL' ? override : 'HOLD';
    } else {
      signal = 'HOLD';
    }

    const confidence = Math.max(0.1, Math.min(1, Number(parts[1]) ?? 0.5));
    const reasoning = parts[2] ?? res.content.slice(0, 120);

    return {
      signal,
      confidence,
      reasoning,
      latencyMs: res.latencyMs,
      provider,
    };
  }

  private heuristicFallback(
    changePct: number,
    rsi: number,
    emaShort: number,
    emaLong: number,
  ): LlmTradeSignal {
    // Deterministic fallback when all LLM providers are unavailable
    let score = 0;
    if (changePct > 2) score += 1;
    if (changePct < -2) score -= 1;
    if (emaShort > emaLong) score += 1;
    if (emaShort < emaLong) score -= 1;
    if (rsi < 30) score += 1;
    if (rsi > 70) score -= 1;

    let signal: 'BUY' | 'SELL' | 'HOLD';
    let confidence: number;
    if (score >= 2) { signal = 'BUY'; confidence = 0.6; }
    else if (score <= -2) { signal = 'SELL'; confidence = 0.6; }
    else { signal = 'HOLD'; confidence = 0.5; }

    return {
      signal,
      confidence,
      reasoning: `heuristic fallback (score=${score}) — all LLM providers unavailable`,
      latencyMs: 0,
      provider: 'heuristic-fallback',
    };
  }
}

export default LlmTradingStrategy;
