/**
 * Negative Risk Scanner strategy for Polymarket binary markets.
 *
 * Scans for arbitrage opportunities where the sum of YES and NO ask prices
 * is less than a threshold (typically < 0.98). This creates a risk-free profit
 * after fees if both tokens are bought simultaneously and held to resolution.
 *
 * Mechanism: When yesAsk + noAsk < threshold, buy both sides. The combined
 * cost is locked in; at settlement, $1 is paid out per winning token, yielding
 * profit = 1 - (yesAsk + noAsk) if both contracts are held to expiry.
 *
 * Signal logic:
 *   1. Fetch active markets from Gamma
 *   2. For each market meeting volume and state criteria, fetch both order books
 *   3. Compute sum = yesAsk (best) + noAsk (best)
 *   4. If sum < threshold → place buy orders for both tokens
 *   5. Apply cooldown per market to avoid spam
 *   6. Hold positions until exit conditions (time-based or profit target)
 */

import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client.js';
import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client.js';
import type { StrategyName } from '../../core/types.js';
import { logger } from '../../core/logger.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface NegativeRiskScannerConfig {
  /** Sum of yesAsk + noAsk must be below this to trigger (e.g., 0.98) */
  threshold: number;
  /** Maximum USD value per leg (YES and NO) */
  maxOpportunitySizeUsdc: number;
  /** Cooldown period per market after entry (ms) */
  cooldownMs: number;
  /** Minimum market volume (USDC) to consider */
  minVolumeUsdc: number;
  /** Take-profit as fraction of entry cost (default: 0.02 = 2%) */
  takeProfitPct?: number;
  /** Stop-loss as fraction (default: 0.015 = 1.5%) */
  stopLossPct?: number;
  /** Maximum hold time before forced exit (ms) */
  maxHoldMs?: number;
}

export const DEFAULT_CONFIG: NegativeRiskScannerConfig = {
  threshold: 0.98,
  maxOpportunitySizeUsdc: 10,
  cooldownMs: 30_000,
  minVolumeUsdc: 1000,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 60 * 60_000, // 1 hour
};

const STRATEGY_NAME = 'negative-risk-scanner' as StrategyName;

// ── Internal types ───────────────────────────────────────────────────────────

interface ArbPosition {
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  yesEntryPrice: number;
  noEntryPrice: number;
  yesSizeUsdc: number;
  noSizeUsdc: number;
  yesOrderId: string;
  noOrderId: string;
  openedAt: number;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Extract best ask price from order book (lowest ask). Returns 1 if no asks. */
export function getBestAsk(book: RawOrderBook): number {
  if (book.asks.length === 0) return 1;
  return parseFloat(book.asks[0].price);
}

/** Extract best bid price from order book (highest bid). Returns 0 if no bids. */
export function getBestBid(book: RawOrderBook): number {
  if (book.bids.length === 0) return 0;
  return parseFloat(book.bids[0].price);
}

/** Calculate token amount from USD size and price. Rounds to nearest integer. */
export function usdcToTokens(usdc: number, price: number): number {
  if (price <= 0) return 0;
  return Math.round(usdc / price);
}

/** Calculate total exit value (USD) for an arb position at current prices. */
export function calcExitValue(
  yesBid: number,
  noBid: number,
  yesSizeUsdc: number,
  noSizeUsdc: number,
  yesEntryPrice: number,
  noEntryPrice: number
): { exitValue: number; entryCost: number; pnlPct: number } {
  const yesTokens = usdcToTokens(yesSizeUsdc, yesEntryPrice);
  const noTokens = usdcToTokens(noSizeUsdc, noEntryPrice);
  const exitValue = yesTokens * yesBid + noTokens * noBid;
  const entryCost = yesSizeUsdc + noSizeUsdc;
  const pnlPct = entryCost > 0 ? (exitValue - entryCost) / entryCost : 0;
  return { exitValue, entryCost, pnlPct };
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface NegativeRiskScannerDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<NegativeRiskScannerConfig>;
}

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createNegativeRiskScannerTick(
  config: NegativeRiskScannerConfig,
  deps: NegativeRiskScannerDeps
): () => Promise<void> {
  const { clob, orderManager, eventBus, gamma } = deps;
  const cfg: NegativeRiskScannerConfig = { ...DEFAULT_CONFIG, ...config };

  // Per-market state
  const positions = new Map<string, ArbPosition>(); // conditionId → position
  const cooldowns = new Map<string, number>(); // conditionId → until timestamp

  // -- Helpers ---------------------------------------------------------------

  function isOnCooldown(conditionId: string): boolean {
    const until = cooldowns.get(conditionId) ?? 0;
    return Date.now() < until;
  }

  function setCooldown(conditionId: string): void {
    cooldowns.set(conditionId, Date.now() + cfg.cooldownMs);
  }

  // -- Exit logic -------------------------------------------------------------

  async function checkExits(): Promise<void> {
    const now = Date.now();
    const toClose: string[] = [];

    for (const [conditionId, pos] of positions.entries()) {
      let shouldExit = false;
      let reason = '';

      try {
        // Fetch current order books for both tokens
        const [yesBook, noBook] = await Promise.all([
          clob.getOrderBook(pos.yesTokenId),
          clob.getOrderBook(pos.noTokenId),
        ]);

        const yesBid = getBestBid(yesBook);
        const noBid = getBestBid(noBook);

        if (yesBid <= 0 || noBid <= 0) continue; // no liquidity

        const { pnlPct } = calcExitValue(
          yesBid,
          noBid,
          pos.yesSizeUsdc,
          pos.noSizeUsdc,
          pos.yesEntryPrice,
          pos.noEntryPrice
        );

        // Take profit
        if (pnlPct >= (cfg.takeProfitPct ?? DEFAULT_CONFIG.takeProfitPct!)) {
          shouldExit = true;
          reason = `take-profit (${(pnlPct * 100).toFixed(2)}%)`;
        }
        // Stop loss
        else if (-pnlPct >= (cfg.stopLossPct ?? DEFAULT_CONFIG.stopLossPct!)) {
          shouldExit = true;
          reason = `stop-loss (${(pnlPct * 100).toFixed(2)}%)`;
        }
        // Max hold time
        else if (cfg.maxHoldMs && now - pos.openedAt > cfg.maxHoldMs) {
          shouldExit = true;
          reason = 'max hold time';
        }

        if (shouldExit) {
          // Place sell orders for both legs
          const yesSizeTokens = usdcToTokens(pos.yesSizeUsdc, pos.yesEntryPrice);
          const noSizeTokens = usdcToTokens(pos.noSizeUsdc, pos.noEntryPrice);

          if (yesSizeTokens > 0) {
            await orderManager.placeOrder({
              tokenId: pos.yesTokenId,
              side: 'sell',
              price: yesBid.toFixed(4),
              size: String(yesSizeTokens),
              orderType: 'IOC',
            });
          }
          if (noSizeTokens > 0) {
            await orderManager.placeOrder({
              tokenId: pos.noTokenId,
              side: 'sell',
              price: noBid.toFixed(4),
              size: String(noSizeTokens),
              orderType: 'IOC',
            });
          }

          logger.info('Exit arbitrage position', STRATEGY_NAME, {
            conditionId: pos.conditionId,
            pnlPct: (pnlPct * 100).toFixed(2) + '%',
            reason,
          });

          eventBus.emit('trade.executed', {
            trade: {
              orderId: pos.yesOrderId,
              marketId: conditionId,
              side: 'sell',
              fillPrice: String(yesBid),
              fillSize: String(pos.yesSizeUsdc),
              fees: '0',
              timestamp: now,
              strategy: STRATEGY_NAME,
            },
          });
          eventBus.emit('trade.executed', {
            trade: {
              orderId: pos.noOrderId,
              marketId: conditionId,
              side: 'sell',
              fillPrice: String(noBid),
              fillSize: String(pos.noSizeUsdc),
              fees: '0',
              timestamp: now,
              strategy: STRATEGY_NAME,
            },
          });

          toClose.push(conditionId);
        }
      } catch (err) {
        logger.warn('Exit check failed', STRATEGY_NAME, {
          conditionId: pos.conditionId,
          err: String(err),
        });
      }
    }

    for (const conditionId of toClose) {
      positions.delete(conditionId);
      setCooldown(conditionId); // apply cooldown after exit
    }
  }

  // -- Entry logic ------------------------------------------------------------

  async function scanEntries(): Promise<void> {
    let markets: GammaMarket[];
    try {
      markets = await gamma.getTrending(15);
    } catch (err) {
      logger.debug('Failed to fetch trending markets', STRATEGY_NAME, {
        err: String(err),
      });
      return;
    }

    for (const market of markets) {
      if (!market.yesTokenId || !market.noTokenId) continue;
      if (market.closed || market.resolved) continue;
      if ((market.volume ?? 0) < cfg.minVolumeUsdc) continue;
      if (positions.has(market.conditionId)) continue; // already have arb position
      if (isOnCooldown(market.conditionId)) continue;

      try {
        // Fetch order books for both tokens in parallel
        const [yesBook, noBook] = await Promise.all([
          clob.getOrderBook(market.yesTokenId),
          clob.getOrderBook(market.noTokenId),
        ]);

        const yesAsk = getBestAsk(yesBook);
        const noAsk = getBestAsk(noBook);

        // Validate prices
        if (yesAsk <= 0 || yesAsk >= 1 || noAsk <= 0 || noAsk >= 1) continue;

        const totalCost = yesAsk + noAsk;
        if (totalCost >= cfg.threshold) continue;

        // Compute token amounts based on maxOpportunitySizeUsdc
        const legSizeUsdc = Math.min(cfg.maxOpportunitySizeUsdc, 1000); // cap at 1000 to avoid fat finger
        const yesSizeTokens = usdcToTokens(legSizeUsdc, yesAsk);
        const noSizeTokens = usdcToTokens(legSizeUsdc, noAsk);

        if (yesSizeTokens <= 0 || noSizeTokens <= 0) continue;

        // Place buy orders
        const [yesOrder, noOrder] = await Promise.all([
          orderManager.placeOrder({
            tokenId: market.yesTokenId,
            side: 'buy',
            price: yesAsk.toFixed(4),
            size: String(yesSizeTokens),
            orderType: 'IOC',
          }),
          orderManager.placeOrder({
            tokenId: market.noTokenId,
            side: 'buy',
            price: noAsk.toFixed(4),
            size: String(noSizeTokens),
            orderType: 'IOC',
          }),
        ]);

        // Record position
        const pos: ArbPosition = {
          conditionId: market.conditionId,
          yesTokenId: market.yesTokenId,
          noTokenId: market.noTokenId,
          yesEntryPrice: yesAsk,
          noEntryPrice: noAsk,
          yesSizeUsdc: legSizeUsdc,
          noSizeUsdc: legSizeUsdc,
          yesOrderId: yesOrder.id,
          noOrderId: noOrder.id,
          openedAt: Date.now(),
        };
        positions.set(market.conditionId, pos);
        setCooldown(market.conditionId);

        const lockedProfit = 1 - totalCost;

        logger.info('Arbitrage opportunity detected', STRATEGY_NAME, {
          conditionId: market.conditionId,
          yesAsk: yesAsk.toFixed(4),
          noAsk: noAsk.toFixed(4),
          totalCost: totalCost.toFixed(4),
          threshold: cfg.threshold,
          legSizeUsdc: legSizeUsdc.toFixed(2),
          lockedProfit: lockedProfit.toFixed(4),
          yesTokens: yesSizeTokens,
          noTokens: noSizeTokens,
        });

        // Emit events for both legs
        eventBus.emit('trade.executed', {
          trade: {
            orderId: yesOrder.id,
            marketId: market.conditionId,
            side: 'buy',
            fillPrice: String(yesAsk),
            fillSize: String(legSizeUsdc),
            fees: '0',
            timestamp: Date.now(),
            strategy: STRATEGY_NAME,
          },
        });
        eventBus.emit('trade.executed', {
          trade: {
            orderId: noOrder.id,
            marketId: market.conditionId,
            side: 'buy',
            fillPrice: String(noAsk),
            fillSize: String(legSizeUsdc),
            fees: '0',
            timestamp: Date.now(),
            strategy: STRATEGY_NAME,
          },
        });
      } catch (err) {
        logger.debug('Entry error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }

  // -- Main tick ---------------------------------------------------------------

  return async function negativeRiskScannerTick(): Promise<void> {
    try {
      await checkExits();
      await scanEntries();

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.size,
        cooldownCount: cooldowns.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
