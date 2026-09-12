/**
 * Jupiter Price API HTTP fetcher with retry, exponential backoff, and rate limiting.
 */
import { rateLimiterRegistry } from '../../../shared/resilience/rate-limiter';
import { type JupiterPriceResponse, type JupiterDataResponse } from './jupiter-price-types';

const JUPITER_RATE_PER_SEC = 10;
// Module-level rate-limiter bucket
rateLimiterRegistry.getOrCreate('jupiter', JUPITER_RATE_PER_SEC);

export async function fetchWithRateLimit(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
): Promise<Response> {
  rateLimiterRegistry.getOrCreate('jupiter', JUPITER_RATE_PER_SEC).tryConsume();
  return fetch(url, init);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractHttpStatus(err: unknown): number | undefined {
  if (err instanceof Error && 'status' in err) {
    const status = (err as Record<string, unknown>).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

export async function fetchWithRetry(
  apiUrl: string,
  timeoutMs: number,
  retries: number,
  params: Record<string, unknown>,
): Promise<Record<string, JupiterPriceResponse>> {
  const url = new URL(apiUrl);
  url.searchParams.set('ids', (params.ids as string[]).join(','));
  url.searchParams.set('vsToken', params.vsToken as string);

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithRateLimit(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const httpError = new Error(`Jupiter API ${response.status}: ${response.statusText}`);
        (httpError as Error & { status: number }).status = response.status;
        throw httpError;
      }
      const json = (await response.json()) as JupiterDataResponse;
      return json.data ?? {};
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Retry on 429 or 5xx
      const status = extractHttpStatus(err);
      if (status === 429 || (status !== undefined && status >= 500)) {
        await sleep(500 * 2 ** attempt); // exponential backoff: 500ms, 1s, 2s
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error('Jupiter: unknown fetch failure');
}
