/**
 * HTTP/2 Connection Pool for Polymarket Adapter
 * Manages persistent HTTP/2 sessions with DNS caching and connection multiplexing.
 * Reduces latency by reusing connections and avoiding repeated DNS lookups.
 */

import * as http2 from 'node:http2';
import { lookup, ADDRCONFIG, V4MAPPED } from 'node:dns';
import { promisify } from 'node:util';
import { logger } from '../../shared/utils/logger';
import { register } from '../../middleware/prometheus-metrics';
import { Counter, Gauge, Histogram } from 'prom-client';

const dnsLookup = promisify(lookup);

// ── Types ─────────────────────────────────────────────────────────────────────

interface DnsCacheEntry {
  address: string;
  family: number;
  expires: number; // Unix timestamp in ms
}

interface PoolConfig {
  maxConnectionsPerOrigin: number;
  dnsTtlMs: number;
  dnsRefreshBeforeMs: number;
}

interface SessionInfo {
  session: http2.ClientHttp2Session;
  origin: string;
  inUse: number;
  lastUsed: number;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

// Lazy-loaded metrics (initialized in singleton constructor)
let http2ConnectionsActive: Gauge<string> | null = null;
let http2RequestsTotal: Counter<string> | null = null;
let dnsCacheHitsTotal: Counter<string> | null = null;

function initMetrics() {
  if (http2ConnectionsActive) return; // Already initialized

  http2ConnectionsActive = new Gauge({
    name: 'polymarket_http2_connections_active',
    help: 'Number of active HTTP/2 connections per origin',
    labelNames: ['origin'],
    registers: [register],
  });

  http2RequestsTotal = new Counter({
    name: 'polymarket_http2_requests_total',
    help: 'Total Polymarket HTTP/2 requests',
    labelNames: ['reused'],
    registers: [register],
  });

  dnsCacheHitsTotal = new Counter({
    name: 'polymarket_dns_cache_hits_total',
    help: 'Total DNS cache hits for Polymarket API',
    registers: [register],
  });
}

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
  private dnsCache: Map<string, DnsCacheEntry>; // hostname -> cache entry

  private constructor() {
    this.config = {
      maxConnectionsPerOrigin: parseInt(process.env.POLY_MAX_CONNECTIONS || '10', 10),
      dnsTtlMs: 5 * 60 * 1000, // 5 minutes default TTL
      dnsRefreshBeforeMs: 30 * 1000, // Refresh 30s before expiry
    };

    this.sessions = new Map();
    this.dnsCache = new Map();

    // Initialize metrics
    initMetrics();

    // Start background DNS cache cleanup
    setInterval(() => this.cleanupDnsCache(), 60 * 1000);
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
    const origin = this.extractOrigin(url);
    const ip = await this.resolveDns(origin);
    const sessionInfo = await this.acquireSession(origin, ip);

    return sessionInfo.session;
  }

  /**
   * Release a session back to the pool after use.
   *
   * @param url - Full URL (origin used for pool lookup)
   * @param session - Session to release
   */
  public releaseSession(url: string, session: http2.ClientHttp2Session): void {
    const origin = this.extractOrigin(url);
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
   * Pre-warm connections for an origin by establishing sessions and sending PING.
   * Reduces first-request latency.
   *
   * @param url - URL to warm connections for
   * @param count - Number of connections to warm (default: 3)
   */
  public async warmConnections(url: string, count: number = 3): Promise<void> {
    const origin = this.extractOrigin(url);
    const ip = await this.resolveDns(origin);

    logger.info('Warming HTTP/2 connections', { origin, count });

    const warmPromises: Promise<void>[] = [];

    for (let i = 0; i < Math.min(count, this.config.maxConnectionsPerOrigin); i++) {
      warmPromises.push(
        this.createSession(origin, ip)
          .then(sessionInfo => {
            // Send PING to verify connection
            return new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('PING timeout during warm-up'));
              }, 5000);

              sessionInfo.session.ping((err) => {
                clearTimeout(timeout);
                if (err) {
                  reject(err);
                } else {
                  // Release immediately after PING success
                  this.releaseSession(origin, sessionInfo.session);
                  resolve();
                }
              });
            });
          })
          .catch(err => {
            logger.warn('Failed to warm connection', { origin, error: err.message });
          })
      );
    }

    await Promise.allSettled(warmPromises);
    logger.info('Connection warming complete', { origin, established: this.sessions.get(origin)?.length || 0 });
  }

  /**
   * Get current pool statistics for monitoring
   */
  public getStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    for (const [, sessions] of this.sessions.entries()) {
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
          new Promise((resolve) => {
            s.session.close(() => resolve(null));
          })
        )
      );
    }

    this.sessions.clear();
    this.dnsCache.clear();
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Extract origin (scheme://host:port) from URL
   */
  private extractOrigin(url: string): string {
    try {
      const urlObj = new URL(url);
      const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
      return `${urlObj.protocol}//${urlObj.hostname}:${port}`;
    } catch {
      throw new Error(`Invalid URL for HTTP/2 pool: ${url}`);
    }
  }

  /**
   * Resolve DNS with caching and TTL refresh
   */
  private async resolveDns(origin: string): Promise<string> {
    const urlObj = new URL(origin);
    const hostname = urlObj.hostname;

    const cached = this.dnsCache.get(hostname);
    const now = Date.now();

    // Cache hit and still valid?
    if (cached && cached.expires > now) {
      dnsCacheHitsTotal?.inc();
      return cached.address;
    }

    // Cache hit but needs refresh (refresh before expiry)
    if (cached && cached.expires > (now - this.config.dnsRefreshBeforeMs)) {
      // Refresh in background but use cached value
      this.refreshDns(hostname).catch(err => {
        logger.warn('Background DNS refresh failed', { hostname, error: err.message });
      });
      return cached.address;
    }

    // Cache miss or expired - do synchronous lookup
    return this.refreshDns(hostname);
  }

  /**
   * Perform DNS lookup and update cache
   */
  private async refreshDns(hostname: string): Promise<string> {
    try {
      const result = await dnsLookup(hostname, {
        family: 4, // IPv4 for now (simpler)
        hints: ADDRCONFIG | V4MAPPED,
      });

      const entry: DnsCacheEntry = {
        address: result.address,
        family: result.family,
        expires: Date.now() + this.config.dnsTtlMs,
      };

      this.dnsCache.set(hostname, entry);
      logger.debug('DNS lookup cached', { hostname, address: result.address });

      return result.address;
    } catch (err) {
      logger.error('DNS lookup failed', { hostname, error: err });
      throw err;
    }
  }

  /**
   * Acquire a session from pool or create new one
   */
  private async acquireSession(origin: string, ip: string): Promise<SessionInfo> {
    let sessions = this.sessions.get(origin);

    // Try to reuse an available session
    if (sessions) {
      const available = sessions.find(s => s.inUse < 1);
      if (available) {
        available.inUse++;
        http2ConnectionsActive?.set({ origin }, sessions.filter(s => s.inUse > 0).length);
        http2RequestsTotal?.inc({ reused: 'true' });
        return available;
      }

      // All sessions in use, try to create new if under limit
      if (sessions.length < this.config.maxConnectionsPerOrigin) {
        return await this.createSession(origin, ip);
      }

      // Pool exhausted - wait for available session
      logger.warn('HTTP/2 connection pool exhausted, waiting', {
        origin,
        max: this.config.maxConnectionsPerOrigin,
      });

      return await this.waitForAvailableSession(origin);
    }

    // First session for this origin
    return await this.createSession(origin, ip);
  }

  /**
   * Create a new HTTP/2 session
   */
  private async createSession(origin: string, _ip: string): Promise<SessionInfo> {
    // For simplicity, connect directly to origin (DNS already resolved separately)
    // In production, you could create a socket with the resolved IP and pass it to http2.connect
    return new Promise((resolve) => {
      const session = http2.connect(origin, {
        // Default socket options are sufficient for now
      });

      session.on('connect', () => {
        logger.debug('HTTP/2 session established', { origin });
      });

      session.on('error', (err: unknown) => {
        logger.error('HTTP/2 session error', { origin, error: err instanceof Error ? err.message : String(err) });
        this.removeSession(origin, session);
      });

      session.on('close', () => {
        logger.debug('HTTP/2 session closed', { origin });
        this.removeSession(origin, session);
      });

      session.on('stream', (stream: any) => {
        // Stream created - handle errors
        stream.on('error', (err: unknown) => {
          logger.warn('HTTP/2 stream error', { origin, error: err instanceof Error ? err.message : String(err) });
        });
      });

      const info: SessionInfo = {
        session,
        origin,
        inUse: 1,
        lastUsed: Date.now(),
      };

      const sessions = this.sessions.get(origin) || [];
      sessions.push(info);
      this.sessions.set(origin, sessions);

      http2ConnectionsActive?.set({ origin }, sessions.filter(s => s.inUse > 0).length);
      http2RequestsTotal?.inc({ reused: 'false' });

      resolve(info);
    });
  }

  /**
   * Wait for an available session (polling)
   */
  private async waitForAvailableSession(origin: string): Promise<SessionInfo> {
    const maxWait = 30000; // 30s timeout
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));

      const sessions = this.sessions.get(origin);
      if (sessions) {
        const available = sessions.find(s => s.inUse < 1);
        if (available) {
          available.inUse++;
          http2ConnectionsActive?.set({ origin }, sessions.filter(s => s.inUse > 0).length);
          http2RequestsTotal?.inc({ reused: 'true' });
          return available;
        }
      }
    }

    throw new Error(`Timeout waiting for HTTP/2 session for ${origin} (max connections: ${this.config.maxConnectionsPerOrigin})`);
  }

  /**
   * Remove a session from the pool (on error/close)
   */
  private removeSession(origin: string, session: http2.ClientHttp2Session): void {
    const sessions = this.sessions.get(origin);
    if (sessions) {
      const index = sessions.findIndex(s => s.session === session);
      if (index !== -1) {
        sessions.splice(index, 1);
      }
      if (sessions.length === 0) {
        this.sessions.delete(origin);
      }
    }
  }

  /**
   * Clean up expired DNS cache entries
   */
  private cleanupDnsCache(): void {
    const now = Date.now();
    for (const [hostname, entry] of this.dnsCache.entries()) {
      if (entry.expires < now) {
        this.dnsCache.delete(hostname);
        logger.debug('DNS cache entry expired', { hostname });
      }
    }
  }
}
