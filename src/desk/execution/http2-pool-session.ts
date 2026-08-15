/**
 * Session lifecycle management for the HTTP/2 connection pool.
 * Handles session creation, acquisition, warm-up, and removal.
 */

import * as http2 from 'node:http2';
import type { SessionInfo, PoolConfig } from './http2-pool-types';
import { http2ConnectionsActive, http2RequestsTotal } from './http2-pool-metrics';
import { logger } from '../../shared/utils/logger';

export interface WarmUpOptions {
  origin: string;
  ip: string;
  count: number;
  config: Required<PoolConfig>;
  createSession: (origin: string, ip: string) => Promise<SessionInfo>;
  releaseSession: (origin: string, session: http2.ClientHttp2Session) => void;
}

/**
 * Poll for an available session until one is free or timeout is reached.
 */
export async function waitForAvailableSession(
  origin: string,
  sessions: Map<string, SessionInfo[]>,
  maxConnections: number,
): Promise<SessionInfo> {
  const maxWait = 30_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100));

    const pool = sessions.get(origin);
    if (pool) {
      const available = pool.find(s => s.inUse < 1);
      if (available) {
        available.inUse++;
        http2ConnectionsActive?.set(
          { origin },
          pool.filter(s => s.inUse > 0).length,
        );
        http2RequestsTotal?.inc({ reused: 'true' });
        return available;
      }
    }
  }

  throw new Error(
    `Timeout waiting for HTTP/2 session for ${origin} (max connections: ${maxConnections})`,
  );
}

/**
 * Remove a session from the pool (called on error/close).
 */
export function removeSession(
  origin: string,
  session: http2.ClientHttp2Session,
  sessions: Map<string, SessionInfo[]>,
): void {
  const pool = sessions.get(origin);
  if (pool) {
    const index = pool.findIndex(s => s.session === session);
    if (index !== -1) {
      pool.splice(index, 1);
    }
    if (pool.length === 0) {
      sessions.delete(origin);
    }
  }
}

/**
 * Pre-establish connections by creating sessions and verifying with PING.
 */
export async function warmUpConnections(opts: WarmUpOptions): Promise<void> {
  const { origin, ip, count, config, createSession, releaseSession } = opts;

  logger.info('Warming HTTP/2 connections', { origin, count });

  const warmPromises: Promise<void>[] = [];

  for (let i = 0; i < Math.min(count, config.maxConnectionsPerOrigin); i++) {
    warmPromises.push(
      createSession(origin, ip)
        .then(sessionInfo =>
          new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('PING timeout during warm-up'));
            }, 5000);

            sessionInfo.session.ping(err => {
              clearTimeout(timeout);
              if (err) {
                reject(err);
              } else {
                releaseSession(origin, sessionInfo.session);
                resolve();
              }
            });
          }),
        )
        .catch(err => {
          logger.warn('Failed to warm connection', {
            origin,
            error: err.message,
          });
        }),
    );
  }

  await Promise.allSettled(warmPromises);
  logger.info('Connection warming complete', {
    origin,
    established: 0, // caller tracks count
  });
}
