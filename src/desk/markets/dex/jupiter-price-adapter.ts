/**
 * Jupiter Solana DEX Adapter — read-only price client.
 *
 * Aggregates DEX prices across Solana via the Jupiter Price API v2.
 * Returns the same DexTokenPrice shape as the Uniswap V3 adapter so
 * strategy code stays format-agnostic.
 */
import {
  type DexTokenPrice,
  type DexPoolReserves,
} from './dex-types';
import {
  DEFAULT_JUPITER_API,
  USDC_MINT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRIES,
  type JupiterPriceConfig,
} from './jupiter-price-types';
import { fetchWithRetry } from './jupiter-price-fetcher';

export { type JupiterPriceConfig } from './jupiter-price-types';
export { getJupiterAdapter, resetJupiterAdapter } from './jupiter-price-singleton';

/**
 * Jupiter Solana DEX price adapter.
 *
 * Fetches token prices via the Jupiter Price API — an off-chain
 * aggregator that polls JIT liquidity, AMM pools, and RFQ systems
 * on Solana, returning a single fair price per token.
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
    const data = await fetchWithRetry(this.apiUrl, this.timeoutMs, this.retries, { ids, vsToken: quoteMint });
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
      const data = await fetchWithRetry(this.apiUrl, this.timeoutMs, this.retries, { ids: chunk, vsToken: quoteMint });
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
   */
  async discoverPools(baseMints: string[], quoteMint = this.quoteMint): Promise<DexPoolReserves[]> {
    const prices = await this.getBatchPrices(baseMints, quoteMint);
    const results: DexPoolReserves[] = [];
    for (const [, price] of prices) {
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
}
