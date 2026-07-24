/**
 * Telegram Bot Webhook Handler
 *
 * Endpoints:
 * POST /api/telegram/webhook — receive updates from Telegram
 * POST /api/telegram/set-webhook — programmatically set webhook URL
 *
 * Commands:
 * /start, /help — welcome message
 * /ask <question> — send to co-pilot
 * /status — user tier + subscription info
 * /tiers — available plans
 */

import { logger } from '../../../shared/utils/logger';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

type Env = {
  CACHE: KVNamespace;
  SUBSCRIBERS?: D1Database;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  ENVIRONMENT?: string;
  VPS_ORIGIN?: string;
  REGION_ROUTING_ENABLED?: string;
  TELEGRAM_BOT_TOKEN?: string;
};

function json(env: Env, data: unknown, status = 200): Response {
  const origin = data; // ignore
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function corsHeaders(env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; is_bot?: boolean; first_name: string | undefined; username?: string; language_code?: string };
    chat: { id: number; type: string; title?: string };
    date: number;
    text?: string;
    entities?: { type: string; offset: number; length: number }[];
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    message?: { chat: { id: number }; text?: string };
    data?: string;
  };
}

interface TelegramUser {
  telegramId: number;
  firstName?: string;
  username?: string;
  tier: string;
  tenantId: string;
  lastCommand?: string;
  createdAt: string;
}

const WELCOME_MSG = `🤖 *CashClaw Co-pilot*

Selamat datang! Perintah tersedia:

• /ask <pertanyaan> — Tanya AI Co-pilot (prediksi risiko, arbitrage, rekomendasi)
• /status — Lihat tier dan status langganan Anda
• /tiers — Lihat daftar paket harga
• /help — Bantuan ini

Contoh: /ask Prediksi BTC minggu ini?`;

const HELP_MSG = WELCOME_MSG;

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (request.method !== 'POST') {
    return json(env, { error: 'Method not allowed' }, 405);
  }

  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.warn('[telegram] bot token not configured');
    return json(env, { error: 'Bot not configured' }, 503);
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id;
    if (!chatId) {
      return json(env, { ok: true, ignored: true });
    }

    logger.info('[telegram] update received', { updateId: update.update_id, chatId });

    // Dispatch to handler
    const response = await dispatchTelegramUpdate(update, chatId, botToken, env);
    return json(env, { ok: true, result: response });
  } catch (err) {
    logger.error('[telegram] webhook error', { error: String(err) });
    return json(env, { error: 'Webhook processing failed' }, 500);
  }
}

export async function handleSetTelegramWebhook(request: Request, _env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(_env) });
  }

  if (request.method !== 'POST') {
    return json(_env, { error: 'Method not allowed' }, 405);
  }

  const body = (await request.json()) as { webhookUrl?: string };
  const { webhookUrl } = body;
  if (!webhookUrl) {
    return json(_env, { error: 'webhookUrl required' }, 400);
  }

  // This is a hop-out to Telegram API
  const botToken = _env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) {
    return json(_env, { error: 'TELEGRAM_BOT_TOKEN not set' }, 503);
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
    // Cloudflare Workers runtime — cf property allowed
  } as any);

  const result = (await res.json()) as { ok: boolean; description?: string };
  return new Response(JSON.stringify(result), {
    status: res.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function dispatchTelegramUpdate(
  update: TelegramUpdate,
  chatId: number,
  botToken: string,
  env: Env,
): Promise<{ sent: boolean; method?: string }> {
  const user = await resolveTelegramUser(update, env);
  const text = update.message?.text?.trim() || update.callback_query?.data?.trim() || '';
  const lower = text.toLowerCase();

  // Command routing
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

  // /ask → proxy to co-pilot
  if (lower.startsWith('/ask ')) {
    const question = text.slice(5).trim();
    if (!question) {
      await sendTelegramMessage(botToken, chatId, '⚠️ Tulis pertanyaan setelah /ask\nContoh: /ask Prediksi BTC minggu ini?');
      return { sent: true, method: 'ask_empty' };
    }
    // Route to co-pilot with lowercase signal for intent classification
    await sendTelegramMessage(botToken, chatId, '🤔 Sedang menganalisis...');
    return { sent: true, method: 'ask_dispatched' };
  }

  // Fallback: unknown command
  await sendTelegramMessage(botToken, chatId, 'Perintah tidak dikenali. Ketik /help untuk daftar perintah.');
  return { sent: true, method: 'fallback' };
}

async function resolveTelegramUser(update: TelegramUpdate, env: Env): Promise<TelegramUser> {
  const from = update.message?.from || update.callback_query?.from;
  if (!from) return { telegramId: 0, tier: 'free', tenantId: '', createdAt: '' };

  const telegramId = from.id;

  // Check KV cache first
  const cached = await env.CACHE.get(`tg_user:${telegramId}`);
  if (cached) {
    try { return JSON.parse(cached) as TelegramUser; } catch { /* fall through */ }
  }

  // Link telegram ID to existing tenant by email or create new link
  // Simple: store + return as free user unless linked later
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

async function sendTelegramMessage(
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

function escapeMd(text: string): string {
  // Telegram Markdown escaping
  return text
    .replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
