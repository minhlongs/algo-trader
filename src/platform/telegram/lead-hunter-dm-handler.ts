import type { Context } from 'grammy';
import { userLinkStore } from './user-link-store';

/**
 * Routes non-command text messages from linked users to LeadHunter.
 * Called from bot.ts for the message:text event when user is linked.
 */
export async function handleLeadHunterDM(
  ctx: Context,
  licenseId: string
): Promise<void> {
  const text = (ctx.message as { text?: string })?.text || '';
  const telegramUserId = ctx.from?.id;

  if (!telegramUserId) return;

  const lower = text.toLowerCase();

  if (lower.includes('status') || lower.includes('usage')) {
    await ctx.reply(
      '📊 Use /status in the bot menu to check your full usage. ' +
        'For anything else, just reply here!'
    );
    return;
  }

  if (lower.includes('help') || lower.includes('support')) {
    await ctx.reply(
      '🆘 I\'m here to help! Use /help for all commands, or just describe what you need and I\'ll route you.'
    );
    return;
  }

  // Default: acknowledge and route
  await ctx.reply(
    `Thanks for reaching out! Your license: ${licenseId.slice(0, 8)}...\n` +
      `I noted your message. An operator will follow up if needed.`
  );
}
