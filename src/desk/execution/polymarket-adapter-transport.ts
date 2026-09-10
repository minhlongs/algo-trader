/**
 * Polymarket CLOB Adapter — HTTP/2 stream execution and signature helpers
 * Extracted from polymarket-adapter.ts to keep files ≤200 LOC.
 */

import { createHmac } from 'crypto';
import * as http2 from 'node:http2';
import type { SignedOrder } from './polymarket-signer';

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

/** Compute HMAC-SHA256 signature for CLOB authentication */
export function computePolymarketSignature(
  apiSecret: string,
  timestamp: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): string {
  if (!apiSecret) throw new Error('API secret required for HMAC signature');
  const msg = timestamp + method.toUpperCase() + path + (body ? JSON.stringify(body) : '');
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
        responseData += chunk;
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
      reqStream.write(JSON.stringify(body));
    }

    reqStream.end();
  });
}
