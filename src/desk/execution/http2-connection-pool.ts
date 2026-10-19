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
import { extractOrigin } from './http2-pool-origin';

export type { DnsCacheEntry, PoolConfig, SessionInfo } from './http2-pool-types';
export { initMetrics } from './http2-pool-metrics';
export { extractOrigin };

/**
 * Singleton pool managing HTTP/2 sessions per origin with DNS caching.
 */
export class Http2ConnectionPool {
  private static instance: Http2ConnectionPool | null = null;

  private config: Required<PoolConfig>;
  private sessions: Map<string, SessionInfo[]>;
  private dns: DnsResolver;
  private cleanupTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.config = {
      maxConnectionsPerOrigin: parseInt(process.env.POLY_MAX_CONNECTIONS || '10', 10),
      dnsTtlMs: 5 * 60 * 1000,
      dnsRefreshBeforeMs: 30 * 1000,
    };

    this.sessions = new Map();
    this.dns = new DnsResolver(this.config);
    initMetrics();

    this.cleanupTimer = setInterval(() => this.dns.cleanup(), 60 * 1000);
    this.cleanupTimer.unref();
  }

  public static getInstance(): Http2ConnectionPool {
    if (!Http2ConnectionPool.instance) {
      Http2ConnectionPool.instance = new Http2ConnectionPool();
    }
    return Http2ConnectionPool.instance;
  }

  /** Get or create an HTTP/2 session for the given URL origin. */
  public async getSession(url: string): Promise<http2.ClientHttp2Session> {
    const origin = extractOrigin(url);
    const ip = await this.dns.resolve(origin);
    const sessionInfo = await acquireSession(origin, ip, this.sessions, this.config);
    return sessionInfo.session;
  }

  /** Release a session back to the pool after use. */
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

  /** Pre-warm connections for an origin. */
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

  /** Get current pool statistics for monitoring */
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

  /** Close all sessions and clear caches (for shutdown) */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down HTTP/2 connection pool');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const [, sessions] of this.sessions.entries()) {
      await Promise.allSettled(
        sessions.map(s => new Promise(resolve => { s.session.close(() => resolve(null)); })),
      );
    }

    this.sessions.clear();
    this.dns.clear();
    Http2ConnectionPool.instance = null;
  }

  public static async shutdownInstance(): Promise<void> {
    if (Http2ConnectionPool.instance) {
      await Http2ConnectionPool.instance.shutdown();
    }
  }
}

export async function shutdownHttp2Pool(): Promise<void> {
  await Http2ConnectionPool.shutdownInstance();
}
