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
import { logger } from './utils/logger';
import { appendTenantAuditLog } from './audit/tenant-audit-log';

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
  /** The wallet label this pipeline is bound to */
  walletLabel: WalletLabel;
  /** USD threshold above which TWAP is used */
  twapThresholdUsd: number;
  /** Record a completed trade outcome — updates wallet balance and drawdown state */
  recordTradeOutcome(trade: WalletTrade, newPortfolioValue: number): void;
}

/**
 * Factory function — creates and wires all 5 pipeline components.
 * Pass the same walletManager/audit instances across pipelines to share state.
 */
export function createTradingPipeline(
  config: TradingPipelineConfig,
  sharedWallet?: WalletManager,
  sharedAudit?: ImmutableTradeAudit
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

    recordTradeOutcome(trade: WalletTrade, newPortfolioValue: number): void {
      // 1. Record trade on wallet (enforces fund isolation)
      wallet.recordTrade(trade, walletLabel);

      // 2. Update drawdown breaker with new portfolio value
      const state = drawdown.update(newPortfolioValue);

      // 3. Audit the trade execution
      audit.append('trade_executed', `${trade.side} $${trade.sizeUsd} on ${trade.marketId} → PnL $${trade.pnl.toFixed(2)}`, {
        walletLabel: trade.walletLabel,
        marketId: trade.marketId,
        side: trade.side,
        actualSize: trade.sizeUsd,
        price: trade.price,
        metadata: {
          pnl: trade.pnl,
          drawdownTier: state.tier,
          portfolioValue: newPortfolioValue,
        },
      });

      appendTenantAuditLog(
        trade.walletLabel || 'legacy-tenant',
        'trade_executed',
        'system',
        `${trade.side} $${trade.sizeUsd} on ${trade.marketId} → PnL $${trade.pnl.toFixed(2)}`,
        {
          walletLabel: trade.walletLabel,
          marketId: trade.marketId,
          side: trade.side,
          actualSize: trade.sizeUsd,
          price: trade.price,
          pnl: trade.pnl,
          drawdownTier: state.tier,
          portfolioValue: newPortfolioValue,
        }
      ).catch((err) => logger.error('[TradingPipeline] Failed to append tenant audit log:', err));

      logger.info(`[TradingPipeline] Trade recorded: ${trade.side} $${trade.sizeUsd} | tier=${state.tier} | portfolio=$${newPortfolioValue.toFixed(2)}`);
    },
  };
}
