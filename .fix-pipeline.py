with open("src/desk/trading-pipeline.ts") as f:
    src = f.read()

# Build the complete new file
result = []

# Part 1: Lines 1-18 (imports BEFORE ImmutableTradeAudit)
for line in src.splitlines(True)[:18]:
    result.append(line)

# Insert the new import
result.append("import { emitTradeAuditEvent } from '../platform/audit/audit-hooks';\n")

# Part 2: Lines 19-91 (from 'import { logger }' through '});' of circuit_breaker)
for line in src.splitlines(True)[18:92]:
    result.append(line)

# Part 3: Insert trade_rejected audit hook BEFORE 'return;'
result.append("\n")
result.append("      // Emit trade_rejected to PostgreSQL tenant audit chain\n")
result.append("      try {\n")
result.append("        await emitTradeAuditEvent({\n")
result.append("          eventType: 'trade_rejected',\n")
result.append("          tenantId: walletLabel,\n")
result.append("          actionBy: 'system',\n")
result.append("          reason: `Drawdown breaker halted: tier=${state.tier}`,\n")
result.append("          metadata: {\n")
result.append("            drawdownTier: state.tier,\n")
result.append("            portfolioValue: newPortfolioValue,\n")
result.append("            drawdownPercent: state.drawdownPercent,\n")
result.append("          },\n")
result.append("        });\n")
result.append("      } catch (auditErr) {\n")
result.append("        logger.warn('[TradingPipeline] trade_rejected audit hook failed', {\n")
result.append("          cause: auditErr instanceof Error ? auditErr.message : String(auditErr),\n")
result.append("        });\n")
result.append("      }\n")

# Part 4: Lines 93-end (from '  }' closing the if, through end of file)
for line in src.splitlines(True)[92:]:
    result.append(line)

# Part 5: Insert trade_executed audit hook after 'await wallet.recordTrade...'
final = []
i = 0
lines = result
while i < len(lines):
    line = lines[i]
    final.append(line)
    # After 'await wallet.recordTrade(trade, walletLabel);\n' followed by blank line, insert hook
    if ("await wallet.recordTrade(trade, walletLabel)" in line
            and i + 1 < len(lines) and lines[i + 1].strip() == ''):
        final.append("\n")
        final.append("      // 3a. Emit trade_executed to PostgreSQL tenant audit chain\n")
        final.append("      try {\n")
        final.append("        await emitTradeAuditEvent({\n")
        final.append("          eventType: 'trade_executed',\n")
        final.append("          tenantId: walletLabel,\n")
        final.append("          actionBy: 'system',\n")
        final.append("          reason: `${trade.side} $${trade.sizeUsd} on ${trade.marketId} -> PnL $${trade.pnl.toFixed(2)}`,\n")
        final.append("          metadata: {\n")
        final.append("            pnl: trade.pnl,\n")
        final.append("            drawdownTier: state.tier,\n")
        final.append("            portfolioValue: newPortfolioValue,\n")
        final.append("            marketId: trade.marketId,\n")
        final.append("            side: trade.side,\n")
        final.append("            sizeUsd: trade.sizeUsd,\n")
        final.append("          },\n")
        final.append("        });\n")
        final.append("      } catch (auditErr) {\n")
        final.append("        logger.warn('[TradingPipeline] trade_executed audit hook failed', {\n")
        final.append("          cause: auditErr instanceof Error ? auditErr.message : String(auditErr),\n")
        final.append("        });\n")
        final.append("      }\n")
    i += 1

with open("src/desk/trading-pipeline.ts", "w") as f:
    f.writelines(final)

print(f"Done. File: {len(final)} lines (was {len(src.splitlines())})")
