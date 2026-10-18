/**
 * Redis Cluster Configuration, Retry, and Health Parsing Helpers
 */

import type { ClusterNode, ClusterOptions } from 'ioredis';
import { logger } from '../shared/utils/logger';

export interface RedisClusterConfig {
  nodes: ClusterNode[];
  password?: string;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  clusterRetryDelayOnFailover: number;
}

export interface ClusterHealthStatus {
  healthy: boolean;
  slotsOk: number;
  slotsTotal: number;
  knownNodes: number;
  state: string;
}

export const DEFAULT_CLUSTER_CONFIG: RedisClusterConfig = {
  nodes: [
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7000 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7001 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7002 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7003 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7004 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7005 },
  ],
  password: process.env.REDIS_CLUSTER_PASSWORD,
  maxRetriesPerRequest: 10,
  retryDelayOnFailover: 500,
  clusterRetryDelayOnFailover: 2000,
};

export function buildClusterOptions(config: RedisClusterConfig): ClusterOptions {
  return {
    clusterRetryStrategy: (times: number) => {
      const delay = Math.min(100 * Math.pow(2, times), 2000);
      logger.debug(`[RedisCluster] Retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
    retryDelayOnFailover: config.retryDelayOnFailover,
    slotsRefreshInterval: 300000,
    slotsRefreshTimeout: 2000,
    redisOptions: {
      password: config.password,
      connectTimeout: 5000,
      commandTimeout: 2000,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      keepAlive: 10000,
      noDelay: true,
    },
    scaleReads: 'slave',
  };
}

export function parseClusterInfoOutput(clusterInfo: string): ClusterHealthStatus {
  const lines = clusterInfo.split('\n');
  const result: ClusterHealthStatus = {
    healthy: false,
    slotsOk: 0,
    slotsTotal: 16384,
    knownNodes: 0,
    state: 'unknown',
  };

  for (const line of lines) {
    if (line.startsWith('cluster_state:')) {
      result.state = line.split(':')[1].trim();
      result.healthy = result.state === 'ok';
    } else if (line.startsWith('cluster_slots_ok:')) {
      result.slotsOk = parseInt(line.split(':')[1].trim());
    } else if (line.startsWith('cluster_known_nodes:')) {
      result.knownNodes = parseInt(line.split(':')[1].trim());
    }
  }

  return result;
}
