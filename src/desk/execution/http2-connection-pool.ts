/**
 * HTTP/2 Connection Pool for Polymarket Adapter
 * Manages persistent HTTP/2 sessions with DNS caching and connection multiplexing.
 * Reduces latency by reusing connections and avoiding repeated DNS lookups.
 */

import * as http2 from 'node:http2';
import { logger } from '../../shared/utils/logger';
import type { PoolConfig, SessionInfo } from './http2-pool-types';
import { initMetrics } from './http2-pool-metrics';
import { warmUpConnections } from './http2-pool-session';
import { DnsResolver } from './http2-pool-dns';
import { acquireSession, createSession } from './http2-pool-factory';

// Re-export all public symbols for backward compatibility
export type { DnsCacheEntry, PoolConfig, SessionInfo } from './http2-pool-types';
export { initMetrics } from './http2-pool-metrics';

// ── Http2ConnectionPool ───────────────────────────────────────────────────────

/**
 * Singleton pool managing HTTP/2 sessions per origin with DNS caching.
 *
 * Features:
 * - DNS caching with TTL-aware refresh (refreshes 30s before expiry)
 * - Session multiplexing (multiple concurrent streams per connection)
 * - Connection limits per origin (default 10)
 * - Automatic reconnection on session errors
 * - Pre-warming with PING frames
 */
export class Http2ConnectionPool {
  private static instance: Http2ConnectionPool | null = null;

  private config: Required<PoolConfig>;
  private sessions: Map<string, SessionInfo[]>; // origin -> sessions
  private dns: DnsResolver;

  private constructor() {
    this.config = {
      maxConnectionsPerOrigin: parseInt(process.env.POLY_MAX_CONNECTIONS || '10', 10),
      dnsTtlMs: 5 * 60 * 1000, // 5 minutes default TTL
      dnsRefreshBeforeMs: 30 * 1000, // Refresh 30s before expiry
    };

    this.sessions = new Map();
    this.dns = new DnsResolver(this.config);

    initMetrics();

    // Periodic DNS cache cleanup
    setInterval(() => this.dns.cleanup(), 60 * 1000);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): Http2ConnectionPool {
    if (!Http2ConnectionPool.instance) {
      Http2ConnectionPool.instance = new Http2ConnectionPool();
    }
    return Http2ConnectionPool.instance;
  }

  /**
   * Get or create an HTTP/2 session for the given URL origin.
   * Sessions are reused and multiplexed.
   *
   * @param url - Full URL (extracts origin: scheme://host:port)
   * @returns http2.ClientHttp2Session ready for request()
   */
  public async getSession(url: string): Promise<http2.ClientHttp2Session> {
    const origin = extractOrigin(url);
    const ip = await this.dns.resolve(origin);
    const sessionInfo = await acquireSession(origin, ip, this.sessions, this.config);

    return sessionInfo.session;
  }

  /**
   * Release a session back to the pool after use.
   *
   * @param url - Full URL (origin used for pool lookup)
   * @param session - Session to release
   */
  public releaseSession(url: string, session: http2.ClientHttp2Session): void {
    const origin = extractOrigin(url);
    const sessions = this.sessions.get(origin);

    if (sessions) {
      const info = sessions.find(s => s.session === session);
      if (info) {
        info.inUse--;
        info.lastUsed = Date.now();
      }
    }
  }

  /**
   * Pre-warm connections for an origin.
   */
  public async warmConnections(url: string, count: number = 3): Promise<void> {
    const origin = extractOrigin(url);
    const ip = await this.dns.resolve(origin);

    await warmUpConnections({
      origin,
      ip,
      count,
      config: this.config,
      createSession: (o, i) => createSession(o, i, this.sessions),
      releaseSession: (o, s) => this.releaseSession(o, s),
    });
  }

  /**
   * Get current pool statistics for monitoring
   */
  public getStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    for (const [origin, sessions] of this.sessions.entries()) {
      stats[origin] = {
        total: sessions.length,
        inUse: sessions.reduce((sum, s) => sum + s.inUse, 0),
        available: sessions.filter(s => s.inUse === 0).length,
        lastUsed: Math.max(...sessions.map(s => s.lastUsed), 0),
      };
    }

    return stats;
  }

  /**
   * Close all sessions and clear caches (for shutdown)
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down HTTP/2 connection pool');

    for (const [, sessions] of this.sessions.entries()) {
      await Promise.allSettled(
        sessions.map(s =>
          new Promise(resolve => {
            s.session.close(() => resolve(null));
          }),
        ),
      );
    }

    this.sessions.clear();
    this.dns.clear();
  }
}

// ── Pure Utility ──────────────────────────────────────────────────────────────

/**
 * Extract origin (scheme://host:port) from URL
 */
export function extractOrigin(url: string): string {
  try {
    const urlObj = new URL(url);
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    return `${urlObj.protocol}//${urlObj.hostname}:${port}`;
  } catch {
    throw new Error(`Invalid URL for HTTP/2 pool: ${url}`);
  }
}
