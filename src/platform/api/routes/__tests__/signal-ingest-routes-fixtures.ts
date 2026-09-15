/**
 * Shared fixtures for signal-ingest-routes tests.
 *
 * Exports:
 *  - TEST_SECRET: HMAC signing secret
 *  - MOCK_STORE: typed empty store for createSignalIngestRouter
 *  - VALID_BODY: 6-field valid body
 *  - buildApp(router, secret?): express factory
 *  - hmacSign(body, secret?, tsSeconds?): HMAC header builder
 */

import express from 'express';
import { createHmac } from 'crypto';

export const TEST_SECRET = 'test-hmac-secret-32chars-xxxxxxxx';
export const MOCK_STORE = {} as unknown as Parameters<typeof import('../signal-ingest-routes.js').createSignalIngestRouter>[0];

export const VALID_BODY = {
  market: 'BTC-USD',
  side: 'BUY',
  size: 0.5,
  confidence: 0.8,
  strategy: 'qwen-m1max-v1',
  ttlSec: 300,
};

export function buildApp(router: express.Router, secret = TEST_SECRET): express.Application {
  process.env.QWEN_INGEST_HMAC_SECRET = secret;
  const app = express();
  // Raw body capture — must parse before HMAC re-stringify
  app.use(express.json());
  app.use('/signals', router);
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
