/**
 * Signal Ingest Routes Test Fixtures — Tranche 41
 * Shared constants, helpers, and app builder for signal-ingest-routes test suites.
 */
import express, { type Express } from 'express';
import { createHmac } from 'crypto';
import { createSignalIngestRouter } from '../signal-ingest-routes';

export const TEST_SECRET = 'test-hmac-secret-32chars-xxxxxxxx';
export const MOCK_STORE = {} as Parameters<typeof createSignalIngestRouter>[0];

export const VALID_BODY = {
  market: 'BTC-USD',
  side: 'BUY',
  size: 0.5,
  confidence: 0.8,
  strategy: 'qwen-m1max-v1',
  ttlSec: 300,
};

export function buildApp(secret = TEST_SECRET): Express {
  process.env.QWEN_INGEST_HMAC_SECRET = secret;
  const app = express();
  app.use(express.json());
  app.use('/signals', createSignalIngestRouter(MOCK_STORE));
  return app;
}

export function hmacSign(
  body: object,
  secret = TEST_SECRET,
  tsSeconds?: number,
): Record<string, string> {
  const ts = tsSeconds ?? Math.floor(Date.now() / 1000);
  const raw = JSON.stringify(body);
  const hex = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  return {
    'x-signature-256': `sha256=${hex}`,
    'x-timestamp': String(ts),
  };
}
