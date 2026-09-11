/**
 * Telegram Bot Types and Constants
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export type Env = {
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

export interface TelegramUpdate {
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

export interface TelegramUser {
  telegramId: number;
  firstName?: string;
  username?: string;
  tier: string;
  tenantId: string;
  lastCommand?: string;
  createdAt: string;
}

export const WELCOME_MSG = `🤖 *CashClaw Co-pilot*

Selamat datang! Perintah tersedia:

• /ask <pertanyaan> — Tanya AI Co-pilot (prediksi risiko, arbitrage, rekomendasi)
• /status — Lihat tier dan status langganan Anda
• /tiers — Lihat daftar paket harga
• /help — Bantuan ini

Contoh: /ask Prediksi BTC minggu ini?`;

export const HELP_MSG = WELCOME_MSG;

export function json(env: Env, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export function corsHeaders(env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
