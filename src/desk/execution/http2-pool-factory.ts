/**
 * Session factory and acquisition logic for the HTTP/2 connection pool.
 * Extracted from Http2ConnectionPool to keep the main module under 200 lines.
 */

import * as http2 from 'node:http2';
import { logger } from '../../shared/utils/logger';
import type { PoolConfig, SessionInfo } from './http2-pool-types';
import { http2ConnectionsActive, http2RequestsTotal } from './http2-pool-metrics';
import { waitForAvailableSession, removeSession } from './http2-pool-session';

/**
 * Acquire an existing idle session, create one if possible, or wait.
 */
export async function acquireSession(
  origin: string,
  ip: string,
  sessions: Map<string, SessionInfo[]>,
  config: Required<PoolConfig>,
): Promise<SessionInfo> {
  const pool = sessions.get(origin);

  if (pool) {
    const available = pool.find(s => s.inUse < 1);
    if (available) {
      available.inUse++;
      http2ConnectionsActive?.set({ origin }, pool.filter(s => s.inUse > 0).length);
      http2RequestsTotal?.inc({ reused: 'true' });
      return available;
    }

    if (pool.length < config.maxConnectionsPerOrigin) {
      return createSession(origin, ip, sessions);
    }

    logger.warn('HTTP/2 connection pool exhausted, waiting', {
      origin,
      max: config.maxConnectionsPerOrigin,
    });

    return waitForAvailableSession(origin, sessions, config.maxConnectionsPerOrigin);
  }

  return createSession(origin, ip, sessions);
}

/**
 * Create a new HTTP/2 session, register it in the pool, and return it.
 */
export function createSession(
  origin: string,
  _ip: string,
  sessions: Map<string, SessionInfo[]>,
): Promise<SessionInfo> {
  return new Promise(resolve => {
    const session = http2.connect(origin);

    session.on('connect', () => {
      logger.debug('HTTP/2 session established', { origin });
    });

    session.on('error', (err: unknown) => {
      logger.error('HTTP/2 session error', {
        origin,
        error: err instanceof Error ? err.message : String(err),
      });
      removeSession(origin, session, sessions);
    });

    session.on('close', () => {
      logger.debug('HTTP/2 session closed', { origin });
      removeSession(origin, session, sessions);
    });

    session.on('remoteSettings', settings => {
      logger.debug('HTTP/2 remote settings', { origin, settings });
    });

    session.on('stream', stream => {
      stream.on('error', (err: unknown) => {
        logger.warn('HTTP/2 stream error', {
          origin,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    const info: SessionInfo = { session, inUse: 1, lastUsed: Date.now() };

    const pool = sessions.get(origin) || [];
    pool.push(info);
    sessions.set(origin, pool);

    http2ConnectionsActive?.set(
      { origin },
      pool.filter(s => s.inUse > 0).length,
    );
    http2RequestsTotal?.inc({ reused: 'false' });

    resolve(info);
  });
}
