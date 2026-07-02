/**
 * Strategy Adapter
 *
 * Thin bridge between existing V2 strategies and the LiveTradingOrchestrator.
 * Strategies call enterPosition()/exitPosition() — the adapter converts these to
 * TradeSignal → StrategyLiveBridge → LiveTradingOrchestrator → CLOB.
 *
 * Supports both PAPER and LIVE modes transparently. Strategies don't know which
 * mode they're running in.
 *
 * Usage:
 *   const orch = new LiveTradingOrchestrator({ paperTrading: true, ... });
 *   const bridge = new StrategyLiveBridge(orch);
 *   const adapter = new StrategyAdapter(bridge, 'spread-mean-reversion-v2');
 *   await adapter.enterPosition({ tokenId, conditionId, side: 'yes', price: 0.55, size: 50 });
 *   await adapter.exitPosition({ tokenId, conditionId, price: 0.62, reason: 'tp' });
 */

import type { StrategyLiveBridge, TradeSignal } from './strategy-live-bridge';
import { logger } from '../../shared/utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EntryRequest {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  price: number;
  size: number;
  strategy?: string;
}

export interface ExitRequest {
  tokenId: string;
  conditionId: string;
  price: number;
  reason: string;
}

export interface AdapterFill {
  orderId: string;
  tokenId: string;
  conditionId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  timestamp: number;
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export class StrategyAdapter {
  private bridge: StrategyLiveBridge;
  private strategyName: string;
  private fills: AdapterFill[] = [];
  private entryCount = 0;
  private exitCount = 0;

  constructor(bridge: StrategyLiveBridge, strategyName: string) {
    this.bridge = bridge;
    this.strategyName = strategyName;
  }

  // ── Strategy-facing API ─────────────────────────────────────────────────────

  /** Enter a position (BUY the specified side token) */
  async enterPosition(req: EntryRequest): Promise<AdapterFill> {
    this.entryCount++;

    const signal: TradeSignal = {
      tokenId: req.tokenId,
      side: 'BUY',
      size: req.size,
      price: req.price,
      description: `${this.strategyName}:${req.conditionId.slice(0, 12)}`,
      confidence: 0.7,
    };

    const result = await this.bridge.onSignal(signal);

    if (result.error && !result.rejected) {
      throw new Error(`Entry failed: ${result.error}`);
    }

    if (result.rejected) {
      throw new Error(`Entry rejected by guard: ${result.rejectReason}`);
    }

    const fill: AdapterFill = {
      orderId: result.response?.orderID ?? `adapter-${Date.now()}`,
      tokenId: req.tokenId,
      conditionId: req.conditionId,
      side: 'BUY',
      price: req.price,
      size: req.size,
      timestamp: Date.now(),
    };

    this.fills.push(fill);
    logger.info(`Adapter: ${this.strategyName} entered`, 'StrategyAdapter', {
      conditionId: req.conditionId.slice(0, 12),
      side: req.side,
      price: req.price,
      orderId: fill.orderId,
    });

    return fill;
  }

  /** Exit a position (SELL to close) */
  async exitPosition(req: ExitRequest): Promise<AdapterFill> {
    this.exitCount++;

    // Look up the actual position size from active fills
    const activeFill = this.getActiveFills().get(req.conditionId);
    const positionSize = activeFill?.size ?? 0;

    const signal: TradeSignal = {
      tokenId: req.tokenId,
      side: 'SELL',
      size: positionSize, // Use actual position size for correct exit
      price: req.price,
      description: `${this.strategyName}:exit:${req.reason}`,
      confidence: 1.0,
    };

    const result = await this.bridge.onSignal(signal);

    if (result.error && !result.rejected) {
      throw new Error(`Exit failed: ${result.error}`);
    }

    const fill: AdapterFill = {
      orderId: result.response?.orderID ?? `adapter-${Date.now()}`,
      tokenId: req.tokenId,
      conditionId: req.conditionId,
      side: 'SELL',
      price: req.price,
      size: 0,
      timestamp: Date.now(),
    };

    this.fills.push(fill);
    logger.info(`Adapter: ${this.strategyName} exited`, 'StrategyAdapter', {
      conditionId: req.conditionId.slice(0, 12),
      reason: req.reason,
      price: req.price,
    });

    return fill;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  getStats() {
    return {
      strategy: this.strategyName,
      entries: this.entryCount,
      exits: this.exitCount,
      totalFills: this.fills.length,
      bridgeStats: this.bridge.getStats(),
    };
  }

  getFills(): AdapterFill[] {
    return [...this.fills];
  }

  getActiveFills(): Map<string, AdapterFill> {
    // Track which conditionIds have open positions
    // An entry without a matching exit = open
    const open = new Map<string, AdapterFill>();
    for (const fill of this.fills) {
      if (fill.side === 'BUY') {
        open.set(fill.conditionId, fill);
      } else {
        open.delete(fill.conditionId);
      }
    }
    return open;
  }
}
