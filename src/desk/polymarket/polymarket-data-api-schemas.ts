/**
 * Zod schemas for the Polymarket Data API v2 / CLOB responses used by
 * `polymarket-data-api-client.ts`.
 *
 * Shapes were taken from live 2026-11-12 responses. Individual rows that fail a schema
 * are skipped by the client; only a wrong envelope fails the whole request.
 */

import { z } from 'zod';

/** One trade from `GET /v2/trades`. Extra fields (icon, name, bio, ...) are ignored. */
export const tradeSchema = z.object({
  proxy_wallet: z.string(),
  side: z.string(),
  token_id: z.string(),
  condition_id: z.string(),
  size: z.number(),
  price: z.number(),
  /** Epoch seconds. */
  timestamp: z.number(),
  title: z.string(),
  slug: z.string(),
  outcome: z.string(),
  transaction_hash: z.string(),
});

/** `{ data: [...], pagination: { has_more, next_cursor } }` — paging is cursor-only. */
export const tradesEnvelopeSchema = z.object({
  data: z.array(z.unknown()),
  pagination: z
    .object({ has_more: z.boolean().optional(), next_cursor: z.string().nullable().optional() })
    .passthrough()
    .optional(),
});

/** One open position from `GET /v2/positions`. */
export const positionSchema = z.object({
  condition_id: z.string(),
  title: z.string(),
  outcome: z.string(),
  current_size: z.number(),
  avg_price: z.number(),
  current_price: z.number(),
  unrealized_pnl: z.number(),
});

export const positionsEnvelopeSchema = z.object({ data: z.array(z.unknown()) }).passthrough();

/** `{ history: [{ t: epochSeconds, p: price }] }` from `GET /prices-history`. */
export const pricesHistorySchema = z.object({
  history: z.array(z.object({ t: z.number(), p: z.number() })),
});
