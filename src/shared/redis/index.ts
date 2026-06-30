/**
 * Redis Client & Connection Pool — shared/redis/ bridge
 * Re-exports from canonical redis/ module.
 */

export {
  getRedisClient,
  getPubClient,
  getSubClient,
  closeRedisConnections,
  isClusterMode,
  type RedisConfig,
  type RedisClientType,
  Redis,
  type Cluster,
} from '../../redis/index';

export {
  getRedisClusterClient,
  getClusterHealth,
  closeRedisClusterClient,
  type RedisClusterConfig,
} from '../../redis/cluster-config';

export { OrderbookManager } from '../../redis/orderbook-manager';
export { PubSubManager } from '../../redis/pubsub';
export { TickerCache } from '../../redis/ticker-cache';
export { TradeStream } from '../../redis/trade-stream';
