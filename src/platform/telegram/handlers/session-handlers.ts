/**
 * Session management handlers — /link, /unlink, /notifications
 */

import type { Context } from 'grammy';
import { userSessionRepo } from '../user-session-repository-d1';

// -- /link -----------------------------------------------------------------

export async function handleLink(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = (ctx.message as { text?: string })?.text?.split(' ');
  if (!args || args.length < 2) {
    await ctx.reply('Usage: /link <your-license-key>');
    return;
  }

  const licenseKey = args[1];
  let session = await userSessionRepo.getByUserId(userId);

  if (!session) {
    await userSessionRepo.upsert({
      userId,
      licenseKeys: [licenseKey],
      notificationsEnabled: true,
      lastCommand: 'link',
    });
    await ctx.reply(
      `✅ License key \`${licenseKey}\` linked successfully!\n\nYou'll now receive alerts for this key.`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  if (session.licenseKeys.includes(licenseKey)) {
    await ctx.reply(`Key \`${licenseKey}\` is already linked.`, { parse_mode: 'Markdown' });
    return;
  }

  session.licenseKeys.push(licenseKey);
  await userSessionRepo.upsert({
    userId,
    licenseKeys: session.licenseKeys,
    notificationsEnabled: session.notificationsEnabled,
    lastCommand: 'link',
  });

  await ctx.reply(
    `✅ License key \`${licenseKey}\` linked successfully!\n\nYou'll now receive alerts for this key.`,
    { parse_mode: 'Markdown' },
  );
}

// -- /unlink ---------------------------------------------------------------

export async function handleUnlink(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = (ctx.message as { text?: string })?.text?.split(' ');
  if (!args || args.length < 2) {
    await ctx.reply('Usage: /unlink <your-license-key>');
    return;
  }

  const licenseKey = args[1];
  const session = await userSessionRepo.getByUserId(userId);

  if (!session) {
    await ctx.reply('No license keys linked.');
    return;
  }

  const index = session.licenseKeys.indexOf(licenseKey);
  if (index === -1) {
    await ctx.reply(`Key \`${licenseKey}\` not found.`, { parse_mode: 'Markdown' });
    return;
  }

  session.licenseKeys.splice(index, 1);
  await userSessionRepo.upsert({
    userId,
    licenseKeys: session.licenseKeys,
    notificationsEnabled: session.notificationsEnabled,
    lastCommand: 'unlink',
  });

  await ctx.reply(`✅ License key \`${licenseKey}\` unlinked.`);
}

// -- /notifications --------------------------------------------------------

export async function handleNotifications(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  let session = await userSessionRepo.getByUserId(userId);

  if (!session) {
    await userSessionRepo.upsert({
      userId,
      licenseKeys: [],
      notificationsEnabled: true,
      lastCommand: 'notifications',
    });
    await ctx.reply('🔔 Notifications enabled.\n\nYou will receive threshold alerts.', { parse_mode: 'Markdown' });
    return;
  }

  session.notificationsEnabled = !session.notificationsEnabled;
  await userSessionRepo.upsert({
    userId,
    licenseKeys: session.licenseKeys,
    notificationsEnabled: session.notificationsEnabled,
    lastCommand: 'notifications',
  });

  const status = session.notificationsEnabled ? 'enabled' : 'disabled';
  await ctx.reply(
    `🔔 Notifications ${status}.\n\nYou will ${session.notificationsEnabled ? '' : 'NOT '}receive threshold alerts.`,
    { parse_mode: 'Markdown' },
  );
}
