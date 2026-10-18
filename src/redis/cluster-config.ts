/**
 * Redis Cluster Client Configuration
 * For 6-node cluster: 3 masters + 3 replicas
 *
 * Usage:
 *   import { getRedisClusterClient } from './cluster-config';
 *   const cluster = getRedisClusterClient();
 */

import { Cluster } from 'ioredis';
import { logger } from '../shared/utils/logger';
import {
  DEFAULT_CLUSTER_CONFIG,
  buildClusterOptions,
  parseClusterInfoOutput,
  type RedisClusterConfig,
  type ClusterHealthStatus,
} from './cluster-config-helpers';

export type { RedisClusterConfig, ClusterHealthStatus };
export { DEFAULT_CLUSTER_CONFIG, buildClusterOptions, parseClusterInfoOutput };

// Cluster client instance
let clusterClient: Cluster | null = null;

/**
 * Create a new Redis Cluster client
 */
export function createRedisClusterClient(): Cluster {
  const config = DEFAULT_CLUSTER_CONFIG;
  const options = buildClusterOptions(config);
  const client = new Cluster(config.nodes, options);

  client.on('error', (err) => {
    logger.error('[RedisCluster] Error:', { message: err.message });
  });

  return client;
}

/**
 * Get Redis Cluster client
 * Uses ioredis Cluster mode with automatic slot routing
 */
export function getRedisClusterClient(): Cluster {
  if (!clusterClient) {
    clusterClient = createRedisClusterClient();

    clusterClient.on('connect', () => {
      logger.info('[RedisCluster] Connected to cluster');
    });

    clusterClient.on('ready', () => {
      logger.info('[RedisCluster] Cluster ready');
    });

    clusterClient.on('close', () => {
      logger.info('[RedisCluster] Connection closed');
    });

    clusterClient.on('clusterError', (err) => {
      logger.error('[RedisCluster] Cluster error:', { err });
    });
  }

  return clusterClient;
}

/**
 * Check cluster health
 * Returns cluster info including slot coverage and node status
 */
export async function getClusterHealth(): Promise<ClusterHealthStatus> {
  const cluster = getRedisClusterClient();

  try {
    const clusterInfo = await cluster.cluster('INFO');
    return parseClusterInfoOutput(clusterInfo);
  } catch (error) {
    logger.error('[RedisCluster] Health check failed:', { error });
    return {
      healthy: false,
      slotsOk: 0,
      slotsTotal: 16384,
      knownNodes: 0,
      state: 'error',
    };
  }
}

/**
 * Close cluster connection
 */
export async function closeRedisClusterClient(): Promise<void> {
  if (clusterClient) {
    await clusterClient.quit();
    clusterClient = null;
    logger.info('[RedisCluster] Connection closed');
  }
}

export { Cluster };

