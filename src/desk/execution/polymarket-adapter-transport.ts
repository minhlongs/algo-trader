/**
 * Polymarket CLOB Adapter — HTTP/2 stream execution, canonical JSON HMAC, and fee-rate normalization.
 * Extracted from polymarket-adapter.ts to keep files ≤200 LOC.
 */

import { createHmac } from 'crypto';
import * as http2 from 'node:http2';
import type { SignedOrder } from './polymarket-signer';

export interface NormalizedPolymarketFeeRate {
  feeRateBps: number;
  ignoredLegacyBaseFee: boolean;
}

/** Recursively sort object keys so JSON serialization is deterministic regardless of key insertion order. */
function sortJsonValueRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValueRecursively);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortJsonValueRecursively((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Canonicalize a request body into compact (`separators=(',',':')`) sorted-key JSON
 * so the L2 HMAC-SHA256 preimage and HTTP/2 wire payload are byte-identical.
 */
export function canonicalizePolymarketJsonBody(body?: Record<string, unknown>): string {
  if (!body) return '';
  return JSON.stringify(sortJsonValueRecursively(body));
}

/**
 * Normalize CLOB `/fee-rate` responses: ignore legacy `base_fee: 1000` fields and
 * coerce empty (`""`) or missing `fee_rate_bps` to `0`.
 */
export function normalizePolymarketFeeRateResponse(
  raw: Record<string, unknown> | null | undefined,
): NormalizedPolymarketFeeRate {
  if (!raw || typeof raw !== 'object') {
    return { feeRateBps: 0, ignoredLegacyBaseFee: false };
  }
  const ignoredLegacyBaseFee = 'base_fee' in raw && raw.base_fee !== undefined;
  const rawBps = raw.fee_rate_bps;
  if (rawBps === undefined || rawBps === null || String(rawBps).trim() === '') {
    return { feeRateBps: 0, ignoredLegacyBaseFee };
  }
  const parsed = Number(rawBps);
  return {
    feeRateBps: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    ignoredLegacyBaseFee,
  };
}

/** Serialize a signed order into the payload expected by CLOB POST /order */
export function serializeSignedOrder(order: SignedOrder): Record<string, unknown> {
  return {
    tokenID: order.tokenId,
    makerAmount: Math.round(order.size * 1e6).toString(),
    takerAmount: Math.round(order.size * order.price * 1e6).toString(),
    expiration: order.expiration.toString(),
    nonce: order.nonce,
    feeRateBps: order.feeRateBps.toString(),
    side: order.side,
    signatureType: order.signatureType,
    signature: order.signature,
    maker: order.maker,
  };
}

/** Compute HMAC-SHA256 signature for CLOB authentication over canonical JSON body */
export function computePolymarketSignature(
  apiSecret: string,
  timestamp: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): string {
  if (!apiSecret) throw new Error('API secret required for HMAC signature');
  const msg = timestamp + method.toUpperCase() + path + canonicalizePolymarketJsonBody(body);
  return createHmac('sha256', apiSecret).update(msg).digest('base64');
}

/** Build auth and content headers required by Polymarket CLOB API */
export function buildPolymarketHeaders(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'POLY-TIMESTAMP': timestamp,
  };

  if (apiKey) {
    headers['POLY-API-KEY'] = apiKey;
    headers['POLY-PASSPHRASE'] = passphrase;
    headers['POLY-SIGNATURE'] = computePolymarketSignature(apiSecret, timestamp, method, path, body);
  }

  return headers;
}

/** Execute an HTTP/2 stream request over an active ClientHttp2Session */
export function executeHttp2StreamRequest<T>(
  session: http2.ClientHttp2Session,
  headers: Record<string, string>,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const reqHeaders: http2.OutgoingHttpHeaders = {
    ':method': method,
    ':path': path,
    ...Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    ),
  };

  return new Promise<T>((resolve, reject) => {
    const reqStream = session.request(reqHeaders);
    let responseData = '';

    reqStream.on('response', (resHeaders) => {
      const status = resHeaders[':status'] as number;

      if (status < 200 || status >= 300) {
        reqStream.on('data', (chunk) => {
          responseData += chunk.toString();
        });
        reqStream.on('end', () => {
          reject(new Error(`Polymarket CLOB error ${status}: ${responseData || resHeaders[':status']}`));
        });
        return;
      }

      reqStream.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      reqStream.on('end', () => {
        try {
          resolve(JSON.parse(responseData) as T);
        } catch (parseErr) {
          reject(new Error(`Failed to parse response: ${parseErr}`));
        }
      });
    });

    reqStream.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      reject(new Error(`HTTP/2 stream error: ${msg}`));
    });

    if (body) {
      reqStream.write(canonicalizePolymarketJsonBody(body));
    }

    reqStream.end();
  });
}
