/**
 * DNS resolution with TTL-aware caching for the HTTP/2 connection pool.
 * Handles background refresh and expired-entry cleanup.
 */

import { lookup, ADDRCONFIG, V4MAPPED } from 'node:dns';
import { promisify } from 'node:util';
import { logger } from '../../shared/utils/logger';
import type { DnsCacheEntry, PoolConfig } from './http2-pool-types';
import { dnsCacheHitsTotal } from './http2-pool-metrics';

const dnsLookup = promisify(lookup);

export interface DnsResolverConfig {
  dnsTtlMs: number;
  dnsRefreshBeforeMs: number;
}

/**
 * Resolves hostnames with an in-memory TTL cache.
 * Background refreshes occur before expiry to avoid blocking callers.
 */
export class DnsResolver {
  private cache = new Map<string, DnsCacheEntry>();

  constructor(private readonly config: DnsResolverConfig) {}

  /**
   * Get the resolved address for an origin URL, using cache when valid.
   */
  async resolve(origin: string): Promise<string> {
    const hostname = new URL(origin).hostname;
    const cached = this.cache.get(hostname);
    const now = Date.now();

    if (cached && cached.expires > now) {
      dnsCacheHitsTotal?.inc();
      return cached.address;
    }

    if (cached && cached.expires > now - this.config.dnsRefreshBeforeMs) {
      this.refresh(hostname).catch(err => {
        logger.warn('Background DNS refresh failed', { hostname, error: err.message });
      });
      return cached.address;
    }

    return this.refresh(hostname);
  }

  /**
   * Perform a fresh DNS lookup and persist the result.
   */
  private async refresh(hostname: string): Promise<string> {
    try {
      const result = await dnsLookup(hostname, {
        family: 4,
        hints: ADDRCONFIG | V4MAPPED,
      });

      const entry: DnsCacheEntry = {
        address: result.address,
        family: result.family,
        expires: Date.now() + this.config.dnsTtlMs,
      };

      this.cache.set(hostname, entry);
      logger.debug('DNS lookup cached', { hostname, address: result.address });

      return result.address;
    } catch (err) {
      logger.error('DNS lookup failed', { hostname, error: err });
      throw err;
    }
  }

  /**
   * Remove expired entries from the cache.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [hostname, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(hostname);
        logger.debug('DNS cache entry expired', { hostname });
      }
    }
  }

  /**
   * Clear the entire cache (used during shutdown).
   */
  clear(): void {
    this.cache.clear();
  }
}
