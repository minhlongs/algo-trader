with open("src/desk/trading-pipeline.ts") as f:
    lines = f.readlines()

# Replace lines 78-161 (the entire recordTradeOutcome method) with correct version
new_method = """  async recordTradeOutcome(trade: WalletTrade, newPortfolioValue: number): Promise<void> {
    // EC#32: Make async (wallet.recordTrade is now async)
    // EC#8: Check drawdown BEFORE mutating wallet
    const state = drawdown.update(newPortfolioValue);

    if (state.tier === 'HALT' || state.tier === 'HARD_STOP') {
      logger.warn(`[TradingPipeline] Trade blocked by drawdown breaker: tier=${state.tier} portfolio=$${newPortfolioValue.toFixed(2)}`);
      audit.append('circuit_breaker', `Drawdown breaker halted: tier=${state.tier}`, {
        walletLabel: trade.walletLabel,
        marketId: trade.marketId,
        side: trade.side,
        metadata: { drawdownTier: state.tier, portfolioValue: newPortfolioValue, reason: `tier=${state.tier} drawdown=${state.drawdownPercent.toFixed(2)}%` },
      });
      try {
        await emitTradeAuditEvent({
          eventType: 'trade_rejected',
          tenantId: walletLabel,
          actionBy: 'system',
          reason: `Drawdown breaker halted: tier=${state.tier}`,
          metadata: {
            drawdownTier: state.tier,
            portfolioValue: newPortfolioValue,
            drawdownPercent: state.drawdownPercent,
          },
        });
      } catch (auditErr) {
        logger.warn('[TradingPipeline] trade_rejected audit hook failed', {
          cause: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }
      return;
    }

    try {
      await wallet.recordTrade(trade, walletLabel);

      try {
        await emitTradeAuditEvent({
          eventType: 'trade_executed',
          tenantId: walletLabel,
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
      } catch (auditErr) {
        logger.warn('[TradingPipeline] trade_executed audit hook failed', {
          cause: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      audit.append('trade_executed', `${trade.side} $${trade.sizeUsd} on ${trade.marketId} -> PnL $${trade.pnl.toFixed(2)}`, {
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

      logger.info(`[TradingPipeline] Trade recorded: ${trade.side} $${trade.sizeUsd} | tier=${state.tier} | portfolio=$${newPortfolioValue.toFixed(2)}`);
    } catch (error) {
      logger.error(`[TradingPipeline] Trade recording failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  },
"""

# Lines 78-161 (0-indexed: 77-160) = method body
new_lines = lines[:77] + [new_method] + lines[161:]

with open("src/desk/trading-pipeline.ts", "w") as f:
    f.writelines(new_lines)

print("Replaced recordTradeOutcome method (lines 78-161)")
