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

import { KellyPositionSizer, type KellyConfig } from './risk/kelly-position-sizer';
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

  const kelly = new KellyPositionSizer(config.kelly);
  const drawdown = new TieredDrawdownBreaker(initialPortfolioValue, config.drawdown);
  const twap = new TwapExecutor(config.twap);
  const wallet = sharedWallet ?? new WalletManager();
  const audit = sharedAudit ?? new ImmutableTradeAudit();
  const twapThresholdUsd = config.twapThresholdUsd ?? 500;

  logger.info(`[TradingPipeline] Created for wallet="${walletLabel}" initial=$${initialPortfolioValue} twapThreshold=$${twapThresholdUsd}`);

  return {
    kelly,
    drawdown,
    twap,
    wallet,
    audit,
    walletLabel,
    twapThresholdUsd,
    ...(providedClobClient && { clobClient: providedClobClient }),

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
