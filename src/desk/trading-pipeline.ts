/**
 * Trading Pipeline — Composes the 5 go-live modules into a single injectable factory.
 *
 * Wiring:
 *   KellyPositionSizer  → called before placing any trade to size positions
 *   TieredDrawdownBreaker → checked on each trade result; gates new trades
 *   TWAPExecutor        → used for orders above $500 threshold
 *   WalletManager       → fund isolation; every trade records against a wallet
 *   ImmutableTradeAudit → append-only log; every decision and outcome persisted
 *
 * All state persists to ~/.cashclaw/ — survives PM2 restarts.
 */

import { KellyPositionSizer, type KellyConfig, type KellySizingInput, type KellySizingResult } from './risk/kelly-position-sizer';
import { RegimeAwareKelly, type RegimeAwareKellyConfig } from './risk/regime-aware-kelly';
import type { MarketRegime } from '../alpha-lab/regimes/regime-types';
import { TieredDrawdownBreaker, type TieredDrawdownConfig } from './risk/tiered-drawdown-breaker';
import { TwapExecutor, type TwapConfig } from './execution/twap-executor';
import { WalletManager, type WalletLabel, type WalletTrade } from './wallet/wallet-manager';
import { ImmutableTradeAudit } from './audit/immutable-trade-audit';
import type { ClobClientInterface } from './polymarket/clob-client';
import { emitTradeAuditEvent } from '../platform/audit/audit-hooks';
import { validateTenantId, type TenantId } from '../shared/tenant';
import { logger } from './utils/logger';

export interface TradingPipelineConfig {
  /** Initial portfolio value in USD (used to bootstrap drawdown breaker) */
  initialPortfolioValue: number;
  /** Wallet label that this pipeline operates on */
  walletLabel: WalletLabel;
  /** Kelly config overrides */
  kelly?: Partial<KellyConfig>;
  /** Drawdown breaker config overrides */
  drawdown?: Partial<TieredDrawdownConfig>;
  /** TWAP executor config overrides */
  twap?: Partial<TwapConfig>;
  /** USD threshold above which orders use TWAP (default $500) */
  twapThresholdUsd?: number;
  /** Optional regime engine for regime-aware position sizing */
  regimeEngine?: { getRegime(market: string, timeframe: string): MarketRegime };
}

export interface TradingPipeline {
  kelly: KellyPositionSizer;
  drawdown: TieredDrawdownBreaker;
  twap: TwapExecutor;
  wallet: WalletManager;
  audit: ImmutableTradeAudit;
  walletLabel: WalletLabel;
  twapThresholdUsd: number;
  /** Optional CLOB client for strategies that need real order-book data */
  clobClient?: ClobClientInterface;
  /** Optional regime engine for regime-aware position sizing */
  regimeEngine?: { getRegime(market: string, timeframe: string): MarketRegime };
  /**
   * Size a position with optional regime-aware Kelly fraction.
   *
   * When a regimeEngine is provided, the regime for the given market/timeframe
   * is fetched and used to adjust the Kelly fraction. Otherwise, plain Kelly
   * sizing is used.
   *
   * @param input - base Kelly sizing inputs plus market and timeframe
   * @returns KellySizingResult with (optionally) regime-adjusted values
   */
  sizePosition(input: { market: string; timeframe: string } & KellySizingInput): KellySizingResult;
  /** Record a completed trade outcome — checks drawdown BEFORE mutating wallet balance */
  recordTradeOutcome(trade: WalletTrade, newPortfolioValue: number): Promise<void>;
}

/**
 * Factory function — creates and wires all 5 pipeline components.
 * Pass the same walletManager/audit instances across pipelines to share state.
 */
export function createTradingPipeline(
  config: TradingPipelineConfig,
  sharedWallet?: WalletManager,
  sharedAudit?: ImmutableTradeAudit,
  providedClobClient?: ClobClientInterface
): TradingPipeline {
  const { initialPortfolioValue, walletLabel } = config;

  const baseKellyConfig: Partial<KellyConfig> = {
    kellyFraction: config.kelly?.kellyFraction ?? 0.25,
    maxPositionFraction: config.kelly?.maxPositionFraction ?? 0.05,
    minPositionUsd: config.kelly?.minPositionUsd ?? 1.0,
    isManagedCapital: config.kelly?.isManagedCapital ?? true,
  };
  const plainKelly = new KellyPositionSizer(baseKellyConfig);
  const regimeAwareKelly = new RegimeAwareKelly({
    kelly: baseKellyConfig,
  } as RegimeAwareKellyConfig);
  const drawdown = new TieredDrawdownBreaker(initialPortfolioValue, config.drawdown);
  const twap = new TwapExecutor(config.twap);
  const wallet = sharedWallet ?? new WalletManager();
  const audit = sharedAudit ?? new ImmutableTradeAudit();
  const twapThresholdUsd = config.twapThresholdUsd ?? 500;

  logger.info(`[TradingPipeline] Created for wallet="${walletLabel}" initial=$${initialPortfolioValue} twapThreshold=$${twapThresholdUsd}`);

  return {
    kelly: plainKelly,
    drawdown,
    twap,
    wallet,
    audit,
    walletLabel,
    twapThresholdUsd,
    ...(providedClobClient && { clobClient: providedClobClient }),
    ...(config.regimeEngine && { regimeEngine: config.regimeEngine }),

    sizePosition(input: { market: string; timeframe: string } & KellySizingInput): KellySizingResult {
      if (config.regimeEngine) {
        const regime = config.regimeEngine.getRegime(input.market, input.timeframe);
        return regimeAwareKelly.size(input, regime);
      }
      return plainKelly.calculatePositionSize(input);
    },

    async recordTradeOutcome(trade: WalletTrade, newPortfolioValue: number): Promise<void> {
      // EC#32: Make async (wallet.recordTrade is now async)
      // EC#8: Check drawdown BEFORE mutating wallet — order was wrong before
      // 1. Check drawdown breaker FIRST (non-mutating read)
      const state = drawdown.update(newPortfolioValue);

      const effectiveTenantId: TenantId = validateTenantId(walletLabel)
        ? (walletLabel as TenantId)
        : (() => { throw new Error(`Invalid walletLabel for audit: ${walletLabel}`) })();

      // 2. Only record trade if drawdown allows it
      if (state.tier === 'HALT' || state.tier === 'HARD_STOP') {
        logger.warn(`[TradingPipeline] Trade blocked by drawdown breaker: tier=${state.tier} portfolio=$${newPortfolioValue.toFixed(2)}`);
        await emitTradeAuditEvent({
          eventType: 'trade_rejected',
          tenantId: effectiveTenantId,
          actionBy: 'system',
          reason: `Drawdown breaker halted: tier=${state.tier}`,
          metadata: {
            drawdownTier: state.tier,
            portfolioValue: newPortfolioValue,
            drawdownPercent: state.drawdownPercent,
          },
        });
        return;
      }

      // EC#9: Wrap remaining operations in try-catch for error handling
      try {
        // 2. Record trade on wallet (enforces fund isolation, mutates balance)
        await wallet.recordTrade(trade, walletLabel);
        await emitTradeAuditEvent({
          eventType: 'trade_executed',
          tenantId: effectiveTenantId,
          actionBy: 'system',
          reason: `${trade.side} $${trade.sizeUsd} on ${trade.marketId} -> PnL $${trade.pnl.toFixed(2)}`,
          metadata: {
            pnl: trade.pnl,
            drawdownTier: state.tier,
            portfolioValue: newPortfolioValue,
            marketId: trade.marketId,
            side: trade.side,
            sizeUsd: trade.sizeUsd,
          },
        });

        logger.info(`[TradingPipeline] Trade recorded: ${trade.side} $${trade.sizeUsd} | tier=${state.tier} | portfolio=$${newPortfolioValue.toFixed(2)}`);
      } catch (error) {
        // metrics tracked via audit log;
        logger.error(`[TradingPipeline] Trade recording failed: ${error instanceof Error ? error.message : String(error)}`);
        // Re-throw so caller knows the trade wasn't recorded
        throw error;
      }
    },
  };
}
