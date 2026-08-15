/**
 * Shared types for the HTTP/2 connection pool.
 * Separated for clean imports across pool modules.
 */

import type * as http2 from 'node:http2';

export interface DnsCacheEntry {
  address: string;
  family: number;
  expires: number; // Unix timestamp in ms
}

export interface PoolConfig {
  maxConnectionsPerOrigin: number;
  dnsTtlMs: number;
  dnsRefreshBeforeMs: number;
}

export interface SessionInfo {
  session: http2.ClientHttp2Session;
  inUse: number;
  lastUsed: number;
}
