/**
 * Trading command handlers — /campaign
 */

import type { Context } from 'grammy';
import { MarketplaceService } from '@platform/marketplace/services/marketplace.service';

// -- /campaign -------------------------------------------------------------

export async function handleCampaign(ctx: Context): Promise<void> {
  const text = (ctx.message as { text?: string })?.text || '';
  const parts = text.split(' ');

  // /campaign <id> — strategy detail
  if (parts.length > 1) {
    const strategyId = parts[1]!;
    try {
      const service = MarketplaceService.getInstance();
      const detail = await service.getStrategyWithDetails(strategyId);
      if (!detail) {
        await ctx.reply('❌ Strategy not found.');
        return;
      }
      const s = detail.strategy;
      const price = detail.listing?.priceUsdMonthly != null
        ? `$${(detail.listing.priceUsdMonthly / 100).toFixed(2)}/month`
        : 'Free';
      const msg = `
📊 *${s.name}*

${s.description}

*Price:* ${price}
*Category:* ${s.category}
*Risk Level:* ${'🔴'.repeat(s.riskLevel) || 'N/A'}
*Tags:* ${s.tags.join(', ') || 'None'}
`.trim();
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply('❌ Could not fetch strategy details. Please try again.');
    }
    return;
  }

  // /campaign — list published strategies
  try {
    const service = MarketplaceService.getInstance();
    const result = await service.listStrategies({ status: 'approved', limit: 20 });
    if (!result.data.length) {
      await ctx.reply('📭 No strategies currently available in the marketplace.');
      return;
    }
    const lines = result.data.map((s: { name: string; description?: string }, i: number) => {
      const price = 'Free'; // listing unavailable in list view
      return `${i + 1}. *${s.name}* — ${price}\n ${(s.description || '').slice(0, 120)}${(s.description?.length ?? 0) > 120 ? '…' : ''}`;
    });
    const msg = `
📢 *Marketplace Campaigns*

${lines.join('\n\n')}

Use /campaign <id> for details.
`.trim();
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch {
    await ctx.reply('❌ Could not fetch marketplace campaigns. Please try again later.');
  }
}
