/**
 * Jupiter Solana DEX Adapter — read-only price client.
 *
 * Aggregates DEX prices across Solana via the Jupiter Price API v2.
 * Returns the same DexTokenPrice shape as the Uniswap V3 adapter so
 * strategy code stays format-agnostic.
 *
 * No RPC node or API key is required — uses the free public endpoint.
 * Rate limit: ~300 req/min (see jup.ag/docs/apis/price-api-v2).
 *
 * Environment variables (all optional):
 *   JUPITER_API_URL  — override the default public endpoint
 *   JUPITER_TIMEOUT  — HTTP timeout in ms (default: 5000)
 *   JUPITER_RETRIES  — retry count on 429/5xx (default: 2)
 */
import {
  type DexAdapterConfig,
  type DexTokenPrice,
  type DexPoolReserves,
} from './dex-types';
import { rateLimiterRegistry } from '../../../shared/resilience/rate-limiter';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Jupiter Price API v2 — lightweight quote endpoint */
const DEFAULT_JUPITER_API = 'https://api.jup.ag/price/v2';

/** USDC mint on Solana mainnet (used as default quote token) */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Default timeout per request */
const DEFAULT_TIMEOUT_MS = 5_000;

/** Retries on transient HTTP errors */
const DEFAULT_RETRIES = 2;

// Module-level rate-limiter bucket (shared across all instances, like other adapters)
const JUPITER_RATE_PER_SEC = 10;
const jupiterBucket = rateLimiterRegistry.getOrCreate('jupiter', JUPITER_RATE_PER_SEC);

// ── Response types (mirrors Jupiter Price API v2 shape) ────────────────────────

interface JupiterPriceResponse {
  type: 'quote';
  price: string; // decimal string, e.g. "0.00234"
  timeTaken: number;
}

interface JupiterDataResponse {
  data?: Record<string, JupiterPriceResponse>;
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export interface JupiterPriceConfig extends DexAdapterConfig {
  /** Override Jupiter API base URL */
  apiUrl?: string;
  /** HTTP request timeout in ms */
  timeoutMs?: number;
  /** Retry count on 429 / 5xx */
  retries?: number;
  /** Requested quote token mint (default USDC) */
  quoteMint?: string;
}

/**
 * Jupiter Solana DEX price adapter.
 *
 * Fetches token prices via the Jupiter Price API — an off-chain
 * aggregator that polls JIT liquidity, AMM pools, and RFQ systems
 * on Solana, returning a single fair price per token.
 *
 * The adapter normalizes Jupiter's output into DexTokenPrice so that
 * all DEX adapters (Uniswap V3, Jupiter) share one input schema.
 */
export class JupiterPriceAdapter {
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly quoteMint: string;

  constructor(config: JupiterPriceConfig = {}) {
    const envTimeout = process.env.JUPITER_TIMEOUT;
    const envRetries = process.env.JUPITER_RETRIES;
    this.apiUrl = config.apiUrl ?? process.env.JUPITER_API_URL ?? DEFAULT_JUPITER_API;
    this.timeoutMs = config.timeoutMs ?? (envTimeout ? Number.parseInt(envTimeout, 10) : DEFAULT_TIMEOUT_MS);
    this.retries = config.retries ?? (envRetries ? Number.parseInt(envRetries, 10) : DEFAULT_RETRIES);
    this.quoteMint = config.quoteMint ?? USDC_MINT;
  }

  /** Adapter name for logging/identification */
  getName(): string {
    return 'jupiter-solana';
  }

  /**
   * Fetch a single token price (base/quote).
   *
   * @param baseMint — SPL token mint (e.g. USDC mint or SOL mint)
   * @param quoteMint — optional quote mint override (defaults to USDC)
   * @returns DexTokenPrice in quote-token units
   */
  async getTokenPrice(baseMint: string, quoteMint = this.quoteMint): Promise<DexTokenPrice> {
    const ids = [baseMint];
    const key = quoteMint === USDC_MINT ? baseMint : `${baseMint}:${quoteMint}`;
    const data = await this.fetchWithRetry({ ids, vsToken: quoteMint });
    const entry = data[key];
    if (!entry) {
      throw new Error(`Jupiter: no price for ${key} — token may not have market liquidity on Solana`);
    }
    return {
      tokenIn: baseMint,
      tokenOut: quoteMint,
      poolAddress: '', // Jupiter is an off-chain aggregator — no single pool
      price: Number.parseFloat(entry.price),
      sqrtPriceX96: '', // not applicable for off-chain price feed
      timestamp: Date.now(),
    };
  }

  /**
   * Batch-fetch prices for multiple tokens.
   *
   * Jupiter caps at 20 ids per request; the adapter auto-chunks so callers
   * can pass any length array.
   */
  async getBatchPrices(baseMints: string[], quoteMint = this.quoteMint): Promise<Map<string, DexTokenPrice>> {
    const CHUNK = 20;
    const results = new Map<string, DexTokenPrice>();
    for (let i = 0; i < baseMints.length; i += CHUNK) {
      const chunk = baseMints.slice(i, i + CHUNK);
      const data = await this.fetchWithRetry({ ids: chunk, vsToken: quoteMint });
      for (const [key, entry] of Object.entries(data)) {
        if (entry) {
          const baseMint = key.includes(':') ? key.split(':')[0] : key;
          results.set(baseMint, {
            tokenIn: baseMint,
            tokenOut: quoteMint,
            poolAddress: '',
            price: Number.parseFloat(entry.price),
            sqrtPriceX96: '',
            timestamp: Date.now(),
          });
        }
      }
    }
    return results;
  }

  /**
   * Discover available pools is not applicable — Jupiter aggregates
   * off-chain. Returns a stub DexPoolReserves array with price metadata.
   * Strategy code calling .discoverPools() on Jupiter will receive a
   * single synthetic entry per unique token pair.
   */
  async discoverPools(baseMints: string[], quoteMint = this.quoteMint): Promise<DexPoolReserves[]> {
    const prices = await this.getBatchPrices(baseMints, quoteMint);
    const results: DexPoolReserves[] = [];
    for (const [tokenIn, price] of prices) {
      results.push({
        poolAddress: '', // Jupiter is agnostic
        reserve0: '',
        reserve1: '',
        sqrtPriceX96: '',
        liquidity: '',
        tick: 0,
        timestamp: price.timestamp,
      });
    }
    return results;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async fetchWithRetry(params: Record<string, unknown>): Promise<Record<string, JupiterPriceResponse>> {
    const url = new URL(this.apiUrl);
    url.searchParams.set('ids', (params.ids as string[]).join(','));
    url.searchParams.set('vsToken', params.vsToken as string);

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await fetchWithRateLimit(url.toString(), {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
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
}

// ── Module-level helpers ───────────────────────────────────────────────────────

async function fetchWithRateLimit(url: string, init: RequestInit & { signal?: AbortSignal }): Promise<Response> {
  rateLimiterRegistry.getOrCreate('jupiter', 10).tryConsume();
  return fetch(url, init);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractHttpStatus(err: unknown): number | undefined {
  if (err instanceof Error && 'status' in err) {
    const status = (err as Record<string, unknown>).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

// ── Convenience singleton ──────────────────────────────────────────────────────

let sharedInstance: JupiterPriceAdapter | null = null;

export function getJupiterAdapter(config?: JupiterPriceConfig): JupiterPriceAdapter {
  if (!sharedInstance) {
    sharedInstance = new JupiterPriceAdapter(config);
  }
  return sharedInstance;
}

export function resetJupiterAdapter(): void {
  sharedInstance = null;
}
