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

import type { StrategyLiveBridge } from './strategy-live-bridge';
import { logger } from '../../shared/utils/logger';
import {
  type EntryRequest,
  type ExitRequest,
  type AdapterFill,
  buildEntrySignal,
  buildExitSignal,
  buildAdapterFill,
  computeActiveFills,
} from './strategy-adapter-helpers';

export type { EntryRequest, ExitRequest, AdapterFill };
export { buildEntrySignal, buildExitSignal, buildAdapterFill, computeActiveFills };

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

    const signal = buildEntrySignal(this.strategyName, req);
    const result = await this.bridge.onSignal(signal);

    if (result.error && !result.rejected) {
      throw new Error(`Entry failed: ${result.error}`);
    }

    if (result.rejected) {
      throw new Error(`Entry rejected by guard: ${result.rejectReason}`);
    }

    const fill = buildAdapterFill(
      'BUY',
      req.tokenId,
      req.conditionId,
      req.price,
      req.size,
      result.response?.orderID,
    );

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

    const activeFill = this.getActiveFills().get(req.conditionId);
    const positionSize = activeFill?.size ?? 0;

    const signal = buildExitSignal(this.strategyName, req, positionSize);
    const result = await this.bridge.onSignal(signal);

    if (result.error && !result.rejected) {
      throw new Error(`Exit failed: ${result.error}`);
    }

    const fill = buildAdapterFill(
      'SELL',
      req.tokenId,
      req.conditionId,
      req.price,
      0,
      result.response?.orderID,
    );

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
    return computeActiveFills(this.fills);
  }
}
