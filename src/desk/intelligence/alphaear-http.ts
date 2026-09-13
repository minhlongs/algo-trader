/**
 * AlphaEar HTTP Transport
 * Low-level HTTP requests to Python sidecar with timeout and logging.
 */

import { logger } from '../core/logger';
import type { SidecarHealth } from './alphaear-types';

export const DEFAULT_TIMEOUT_MS = 30_000;

export async function postAlphaEar<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T | null> {
  try {
    const resp = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      logger.warn(`AlphaEar ${path} returned ${resp.status}`, 'AlphaEarClient');
      return null;
    }
    return resp.json() as Promise<T>;
  } catch {
    logger.debug(`AlphaEar ${path} unavailable`, 'AlphaEarClient');
    return null;
  }
}

export async function fetchAlphaEarHealth(
  baseUrl: string,
  timeoutMs: number = 5000
): Promise<SidecarHealth | null> {
  try {
    const resp = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resp.ok) {
      return resp.json() as Promise<SidecarHealth>;
    }
    return null;
  } catch {
    return null;
  }
}
