/**
 * Cross-Market Arbitrage Strategy — V2 implementation.
 *
 * Detects price discrepancies between related Polymarket markets that
 * share the same underlying event (e.g., different resolution criteria
 * or group items). Enters when the basis exceeds a configurable threshold.
 *
 * Entry: |priceA - priceB| > minBasis where markets are related
 * Exit: basis converges below exitThreshold or TP/SL/hold limits
 */

import { EventEmitter } from 'events';
import type { ClobClient } from '../../polymarket/clob-client';
import type { MarketScanner } from '../../polymarket/market-scanner';
import type { StrategyConfig } from '../../core/types';
import { logger } from '../../core/logger';
import {
  type CrossMarketArbConfig,
  type ArbPosition,
  DEFAULT_CONFIG,
  computeBasis,
  getArbDirection,
  calcBookMidPrice,
} from './cross-market-arb-types';

export type { CrossMarketArbConfig } from './cross-market-arb-types';
export { computeBasis, getArbDirection } from './cross-market-arb-types';

export class CrossMarketArbStrategy extends EventEmitter {
  private readonly cfg: CrossMarketArbConfig;
  private readonly capital: string;
  private readonly positions: ArbPosition[] = [];
  private running = false;

  constructor(
    private clobClient: ClobClient,
    private scanner: MarketScanner,
    cfg: StrategyConfig,
    capital: string,
  ) {
    super();
    this.cfg = { ...DEFAULT_CONFIG, ...(cfg.params as Partial<CrossMarketArbConfig>) };
    this.capital = capital;
    this.running = true;
    logger.info('[cross-market-arb] Strategy initialized', {
      minBasis: this.cfg.minBasis,
      maxPositions: this.cfg.maxPositions,
      capital: this.capital,
    });
  }

  /** Main tick: scan related markets for arb opportunities. */
  async executeTick(): Promise<void> {
    if (!this.running) return;

    try {
      await this.checkExits();

      const result = await this.scanner.scan({ minVolume: 500 });
      const opps = result.opportunities;

      for (let i = 0; i < opps.length - 1 && this.positions.length < this.cfg.maxPositions; i++) {
        for (let j = i + 1; j < opps.length && this.positions.length < this.cfg.maxPositions; j++) {
          const oppA = opps[i]!;
          const oppB = opps[j]!;

          if (oppA.conditionId === oppB.conditionId) continue;

          try {
            const bookA = await this.clobClient.getOrderBook(oppA.yesTokenId);
            const bookB = await this.clobClient.getOrderBook(oppB.yesTokenId);

            const midA = calcBookMidPrice(bookA);
            const midB = calcBookMidPrice(bookB);
            if (midA <= 0 || midB <= 0) continue;

            const basis = computeBasis(midA, midB);
            if (basis < this.cfg.minBasis) continue;

            const dir = getArbDirection(midA, midB);
            this.positions.push({
              tokenIdA: oppA.yesTokenId,
              tokenIdB: oppB.yesTokenId,
              conditionIdA: oppA.conditionId,
              conditionIdB: oppB.conditionId,
              entryBasis: basis,
              sideA: dir.sideA,
              sizeUsdc: this.cfg.defaultSizeUsdc,
              openedAt: Date.now(),
            });

            logger.info('[cross-market-arb] Position opened', {
              basis: basis.toFixed(4),
              dir: `${dir.sideA}/${dir.sideB}`,
              size: this.cfg.defaultSizeUsdc,
            });
          } catch {
            continue;
          }
        }
      }
    } catch (err) {
      logger.warn('[cross-market-arb] Tick error', { err: String(err) });
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.positions.length = 0;
    logger.info('[cross-market-arb] Stopped');
  }

  private async checkExits(): Promise<void> {
    const toRemove: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i]!;

      try {
        const bookA = await this.clobClient.getOrderBook(pos.tokenIdA);
        const bookB = await this.clobClient.getOrderBook(pos.tokenIdB);
        const midA = calcBookMidPrice(bookA);
        const midB = calcBookMidPrice(bookB);

        const currentBasis = computeBasis(midA, midB);

        if (currentBasis <= this.cfg.exitBasis || Date.now() - pos.openedAt > 30 * 60_000) {
          toRemove.push(i);
          const reason = currentBasis <= this.cfg.exitBasis ? 'converged' : 'timeout';
          logger.info('[cross-market-arb] Position closed', { reason, basis: currentBasis.toFixed(4) });
        }
      } catch {
        toRemove.push(i);
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.positions.splice(toRemove[i]!, 1);
    }
  }
}
