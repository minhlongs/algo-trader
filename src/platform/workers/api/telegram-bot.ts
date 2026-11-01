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
import {
  Env,
  TelegramUpdate,
  TelegramUser,
  WELCOME_MSG,
  HELP_MSG,
  json,
  corsHeaders,
  escapeMd,
} from './telegram-bot-types';
import {
  sendTelegramMessage,
  resolveTelegramUser,
  dispatchTelegramUpdate,
} from './telegram-bot-dispatch';

export type { Env, TelegramUpdate, TelegramUser };
export {
  WELCOME_MSG,
  HELP_MSG,
  json,
  corsHeaders,
  escapeMd,
  sendTelegramMessage,
  resolveTelegramUser,
  dispatchTelegramUpdate,
};

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (request.method !== 'POST') {
    return json(env, { error: 'Method not allowed' }, 405);
  }

  // Fail-closed: always require TELEGRAM_WEBHOOK_SECRET and matching header
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn('[telegram] webhook secret not configured');
    return json(env, { error: 'Webhook secret not configured' }, 503);
  }

  const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!secretHeader || secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn('[telegram] unauthorized webhook call: missing or mismatched secret token');
    return json(env, { error: 'Unauthorized' }, 401);
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

  const adminKey = _env.ADMIN_API_KEY;
  const providedKey = request.headers.get('x-api-key');
  if (!adminKey || !providedKey || providedKey !== adminKey) {
    return json(_env, { error: 'Unauthorized' }, 401);
  }

  const body = (await request.json()) as { webhookUrl?: string };
  const { webhookUrl } = body;
  if (!webhookUrl) {
    return json(_env, { error: 'webhookUrl required' }, 400);
  }

  let parsedWebhookUrl: URL;
  try {
    parsedWebhookUrl = new URL(webhookUrl);
  } catch {
    return json(_env, { error: 'Invalid webhookUrl' }, 400);
  }
  const allowedWebhookHosts = ['api.cashclaw.cc', 'algo-trader-staging.agencyos-openclaw.workers.dev', 'algo-trader-staging.workers.dev'];
  if (parsedWebhookUrl.protocol !== 'https:' || !allowedWebhookHosts.includes(parsedWebhookUrl.hostname)) {
    return json(_env, { error: 'Forbidden webhookUrl host' }, 400);
  }

  const botToken = _env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) {
    return json(_env, { error: 'TELEGRAM_BOT_TOKEN not set' }, 503);
  }

  const webhookPayload: Record<string, string> = { url: webhookUrl };
  if (_env.TELEGRAM_WEBHOOK_SECRET) {
    webhookPayload.secret_token = _env.TELEGRAM_WEBHOOK_SECRET;
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload),
  });

  const result = (await res.json()) as { ok: boolean; description?: string };
  return new Response(JSON.stringify(result), {
    status: res.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
}
