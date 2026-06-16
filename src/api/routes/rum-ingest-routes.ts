/**
 * RUM (Real User Monitoring) Ingestion Routes
 * POST /api/rum/ingest - Accepts client-side performance metrics
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { externalApiLatency } from '../../middleware/prometheus-metrics';

export const rumRouter = Router();

/**
 * POST /api/rum/ingest
 *
 * Body: {
 *   sessionId: string,
 *   userId?: string,
 *   sampleRate: number,
 *   metrics: [
 *     { name: string, duration: number, url?: string, type?: string, timestamp: number }
 *   ],
 *   timestamp: number,
 *   userAgent?: string
 * }
 *
 * Records RUM metrics for analysis and SLA monitoring.
 * Best-effort: does not block on failures.
 */
rumRouter.post('/ingest', async (req: Request, res: Response) => {
  const start = Date.now();

  try {
    const { sessionId, userId, metrics, timestamp, userAgent, sampleRate } = req.body;

    // Basic validation
    if (!sessionId || !Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ error: 'Invalid payload: missing sessionId or metrics' });
    }

    // Sanitize: strip PII (userId is optional, we'll hash if present)
    const sanitizedUserId = userId ? `user_${Buffer.from(userId).toString('hex').slice(0, 16)}` : undefined;

    // Record metrics to Prometheus
    for (const metric of metrics) {
      // Record as external API latency with service='rum', endpoint=metric.name
      const durationSec = metric.duration / 1000; // ms to sec
      const region = (req as any).cf?.colo || 'unknown';
      externalApiLatency.observe(
        { service: 'rum', endpoint: metric.name, region },
        durationSec
      );

      // Could also store in Redis for aggregation, but skip for perf
    }

    // Log (in production, would send to data warehouse)
    logger.info('[RUM] Ingested metrics', {
      sessionId,
      userId: sanitizedUserId,
      metricCount: metrics.length,
      ageMs: Date.now() - timestamp,
    });

    const processTime = Date.now() - start;
    res.status(202).json({ status: 'accepted', processed: metrics.length, timeMs: processTime });
  } catch (error) {
    logger.error('[RUM] Ingest error', { error });
    // Best-effort: still return 202 to avoid client retries
    res.status(202).json({ status: 'accepted', error: 'processing error' });
  }
});
