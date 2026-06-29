/**
 * Signal Ingest Routes
 * POST /api/v1/signals/ingest
 *
 * HMAC-authenticated endpoint for Qwen M1 Max daemon to push trade signals.
 * Verifies X-Signature-256 + X-Timestamp before calling SignalPublisher.publish().
 * Signals flow through existing D1 → SSE → Telegram fan-out with no new machinery.
 *
 * Security:
 *   - HMAC-SHA256 symmetric secret (QWEN_INGEST_HMAC_SECRET)
 *   - 5-minute timestamp window (replay protection)
 *   - Strategy allow-list (qwen-m1max-v1, deepseek-m1max-v1)
 *   - Route-level rate limit: 60 req/min
 *   - X-Robots-Tag: noindex (not publicly advertised)
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { verifyHmacSha256 } from '../../shared/utils/hmac-verifier';
import { SignalPublisher } from '../../signal/signal-publisher';
import type { SignalStore } from '../../signal/signal-publisher';
import { logger } from '../../shared/utils/logger';
import { qwenSignalsTotal } from '../../middleware/prometheus-metrics';

/** Strategies allowed to ingest via this endpoint */
const ALLOWED_STRATEGIES = ['qwen-m1max-v1', 'deepseek-m1max-v1'] as const;

/** Zod schema for ingest body — maps to RawSignalInput */
const ingestBodySchema = z.object({
  market: z.string().min(1).max(64),
  side: z.enum(['BUY', 'SELL']),
  size: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  strategy: z.enum(ALLOWED_STRATEGIES),
  ttlSec: z.number().int().min(60).max(86400),
  ts: z.number().int().optional(),
});

/** Rate limit: 60 requests/min — daemon posts ≤1/min, headroom for retries */
const ingestRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  message: { error: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Factory: create the ingest router with injected SignalPublisher.
 * Allows test injection of mock store without touching singleton.
 */
export function createSignalIngestRouter(store: SignalStore): Router {
  const router = Router();
  const publisher = new SignalPublisher(store);

  // Mark route as non-indexable
  router.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex');
    next();
  });

  /**
   * POST /ingest
   * Body: { market, side, size, confidence, strategy, ttlSec, ts? }
   * Headers: X-Signature-256: sha256=<hex>, X-Timestamp: <unix_seconds>
   */
  router.post('/ingest', ingestRateLimit, async (req: Request, res: Response) => {
    const secret = process.env.QWEN_INGEST_HMAC_SECRET;
    if (!secret) {
      logger.error('[SignalIngest] QWEN_INGEST_HMAC_SECRET not configured');
      res.status(500).json({ error: 'Endpoint not configured' });
      return;
    }

    // Extract HMAC headers
    const signature = req.headers['x-signature-256'] as string | undefined;
    const tsHeader = req.headers['x-timestamp'] as string | undefined;

    if (!signature || !tsHeader) {
      res.status(401).json({ error: 'Missing authentication headers' });
      return;
    }

    const tsSeconds = parseInt(tsHeader, 10);
    if (isNaN(tsSeconds)) {
      res.status(401).json({ error: 'Invalid X-Timestamp header' });
      return;
    }

    // Raw body needed for HMAC — express.json() already parsed, re-stringify consistently
    const rawBody = JSON.stringify(req.body);

    const valid = verifyHmacSha256(rawBody, signature, secret, tsSeconds);
    if (!valid) {
      logger.warn('[SignalIngest] HMAC verification failed', {
        ip: req.ip,
        ts: tsSeconds,
      });
      qwenSignalsTotal.inc({ result: 'rejected' });
      res.status(401).json({ error: 'Invalid signature or expired timestamp' });
      return;
    }

    // Validate body schema
    const parsed = ingestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map((i) => i.message),
      });
      return;
    }

    const input = parsed.data;

    // Publish via existing fan-out (D1 → SSE → Telegram)
    try {
      const signal = await publisher.publish({
        market: input.market,
        side: input.side,
        size: input.size,
        confidence: input.confidence,
        strategy: input.strategy,
        ttlSec: input.ttlSec,
        ts: input.ts,
      });

      if (!signal) {
        // Deduplicated — idempotent success
        res.status(202).json({ status: 'deduplicated', id: null });
        return;
      }

      qwenSignalsTotal.inc({ result: 'accepted' });
      logger.info(`[SignalIngest] Accepted signal id=${signal.id} strategy=${signal.strategy}`);
      res.status(202).json({ status: 'accepted', id: signal.id });
    } catch (err) {
      logger.error('[SignalIngest] Publisher error', { err });
      res.status(500).json({ error: 'Internal error publishing signal' });
    }
  });

  return router;
}
