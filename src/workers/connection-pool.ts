/**
 * Connection Pool Manager
 * Manages Hyperdrive connection pools for different services
 */

export interface PoolConfig {
  service: 'polymarket' | 'llm' | 'exchange';
  maxConnections: number;
  maxIdle: number;
  ttl: number;
}

export interface PoolMetrics {
  service: string;
  activeConnections: number;
  idleConnections: number;
  waitQueueLength: number;
}

export class ConnectionPoolManager {
  private pools: Map<string, any>; // Hyperdrive instances
  private config: PoolConfig[];

  constructor(config: PoolConfig[]) {
    this.config = config;
    this.pools = new Map();
  }

  /**
   * Initialize pool for a service (called lazily on first use)
   */
  private getPool(service: string): any {
    if (!this.pools.has(service)) {
      throw new Error(`No pool configured for service: ${service}. Call initPool() first.`);
    }
    return this.pools.get(service);
  }

  /**
   * Initialize Hyperdrive pool (to be called during worker startup)
   * In Cloudflare Workers, Hyperdrive is bound via wrangler.toml
   */
  initPool(service: string, hyperdriveBinding: any): void {
    this.pools.set(service, hyperdriveBinding);
  }

  /**
   * Execute fetch using connection pool
   */
  async fetchWithPool(service: string, url: string, options: RequestInit = {}): Promise<Response> {
    const pool = this.getPool(service);
    const request = new Request(url, {
      ...options,
      // Hyperdrive handles connection reuse automatically
      cf: { cacheTtl: 0 } as any,
    });
    return await pool.fetch(request);
  }

  /**
   * Get metrics for all pools
   */
  getMetrics(): PoolMetrics[] {
    const metrics: PoolMetrics[] = [];
    for (const [service, pool] of this.pools.entries()) {
      const config = this.config.find(c => c.service === service);
      metrics.push({
        service,
        activeConnections: config?.maxConnections || 0,
        idleConnections: config?.maxIdle || 0,
        waitQueueLength: 0, // Hyperdrive manages internally
      });
    }
    return metrics;
  }

  /**
   * Check if pool exists
   */
  hasPool(service: string): boolean {
    return this.pools.has(service);
  }
}

// Singleton instance for global use
let globalPoolManager: ConnectionPoolManager | null = null;

export function getConnectionPoolManager(): ConnectionPoolManager {
  if (!globalPoolManager) {
    globalPoolManager = new ConnectionPoolManager([
      { service: 'polymarket', maxConnections: 20, maxIdle: 10, ttl: 30 },
      { service: 'llm', maxConnections: 10, maxIdle: 5, ttl: 60 },
      { service: 'exchange', maxConnections: 15, maxIdle: 8, ttl: 30 },
    ]);
  }
  return globalPoolManager;
}
