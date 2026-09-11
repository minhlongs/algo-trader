/**
 * Telegram Bot Dispatch and Command Handlers
 */

import { logger } from '../../../shared/utils/logger';
import {
  Env,
  TelegramUpdate,
  TelegramUser,
  WELCOME_MSG,
  escapeMd,
} from './telegram-bot-types';

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  parseMode?: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } as any);
    if (!res.ok) {
      const errText = await res.text();
      logger.warn('[telegram] sendMessage failed', { status: res.status, error: errText });
    }
  } catch (e) {
    logger.error('[telegram] sendMessage error', { error: String(e) });
  }
}

export async function resolveTelegramUser(update: TelegramUpdate, env: Env): Promise<TelegramUser> {
  const from = update.message?.from || update.callback_query?.from;
  if (!from) return { telegramId: 0, tier: 'free', tenantId: '', createdAt: '' };

  const telegramId = from.id;

  const cached = await env.CACHE.get(`tg_user:${telegramId}`);
  if (cached) {
    try {
      return JSON.parse(cached) as TelegramUser;
    } catch {
      /* fall through */
    }
  }

  const user: TelegramUser = {
    telegramId,
    firstName: (from as any).first_name || undefined,
    username: from.username || undefined,
    tier: 'free',
    tenantId: '',
    createdAt: new Date().toISOString(),
  };

  await env.CACHE.put(`tg_user:${telegramId}`, JSON.stringify(user), { expirationTtl: 86400 });
  return user;
}

export async function dispatchTelegramUpdate(
  update: TelegramUpdate,
  chatId: number,
  botToken: string,
  env: Env,
): Promise<{ sent: boolean; method?: string }> {
  const user = await resolveTelegramUser(update, env);
  const text = update.message?.text?.trim() || update.callback_query?.data?.trim() || '';
  const lower = text.toLowerCase();

  if (lower.startsWith('/start') || lower.startsWith('/help')) {
    await sendTelegramMessage(botToken, chatId, escapeMd(WELCOME_MSG), 'Markdown');
    return { sent: true, method: 'welcome' };
  }

  if (lower.startsWith('/status')) {
    const tier = user.tier || 'free';
    const sub = env.SUBSCRIBERS;
    let subStatus = 'active';
    let periodEnd = '';
    if (sub) {
      try {
        const row = await sub
          .prepare('SELECT status, current_period_end FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
          .bind(user.tenantId)
          .first<{ status: string; current_period_end: string }>();
        if (row) {
          subStatus = row.status;
          periodEnd = row.current_period_end || '';
        }
      } catch (e) {
        logger.warn('[telegram] status sub query failed', { error: String(e) });
      }
    }
    const msg = `📊 *CashClaw Status*\n\nTier: ${tier.toUpperCase()}\nLangganan: ${subStatus}\n${periodEnd ? `Berakhir: ${periodEnd}` : ''}`;
    await sendTelegramMessage(botToken, chatId, escapeMd(msg), 'Markdown');
    return { sent: true, method: 'status' };
  }

  if (lower.startsWith('/tiers')) {
    const tierList = [
      { tier: 'FREE', price: '$0', features: 'Scanning dasar' },
      { tier: 'STARTER', price: '$49', features: 'AI Co-pilot, Marketplace' },
      { tier: 'PRO', price: '$99', features: 'Full Co-pilot, Telegram /ask' },
      { tier: 'ENTERPRISE', price: '$299', features: 'Custom strategies, Dedicated infra' },
      { tier: 'MASTER', price: 'Custom', features: 'White-label, Private marketplace' },
    ];
    let msg = '💎 *Paket CashClaw*\n\n';
    for (const t of tierList) {
      msg += `${t.tier} ${t.price} — ${t.features}\n`;
    }
    msg += '\nUpgrade: hubungi support atau pakai kupon.';
    await sendTelegramMessage(botToken, chatId, escapeMd(msg), 'Markdown');
    return { sent: true, method: 'tiers' };
  }

  if (lower.startsWith('/ask ')) {
    const question = text.slice(5).trim();
    if (!question) {
      await sendTelegramMessage(botToken, chatId, '⚠️ Tulis pertanyaan setelah /ask\nContoh: /ask Prediksi BTC minggu ini?');
      return { sent: true, method: 'ask_empty' };
    }
    await sendTelegramMessage(botToken, chatId, '🤔 Sedang menganalisis...');
    return { sent: true, method: 'ask_dispatched' };
  }

  await sendTelegramMessage(botToken, chatId, 'Perintah tidak dikenali. Ketik /help untuk daftar perintah.');
  return { sent: true, method: 'fallback' };
}
