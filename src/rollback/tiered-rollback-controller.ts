/**
 * Tiered Rollback Controller (L0-L4)
 * Centralized orchestrator for runtime safety layers with cross-instance coordination.
 *
 * Rollback Hierarchy (from highest to lowest precedence):
 * - L0_SIGNALS: Qwen signals loop health (freshness + error rate)
 * - L1_KILL: Manual kill switch (QWEN_KILL=1)
 * - L2_DISABLED: Swarm disabled programmatically (drawdown breach, system error)
 * - L3_DRAWDOWN: Portfolio drawdown tier (ALERT, REDUCE, HALT, HARD_STOP)
 * - L4_PAPER_GATE: Minimum paper trading period before live eligibility
 *
 * Overall state = highest severity active layer.
 * States: ACTIVE, RESTRICTED, HALTED, BLOCKED
 */

import { getRedisClient, type RedisClientType } from '../redis';
import { logger } from '../shared/utils/logger';
import { setQwenKillSwitch, setQwenDrawdownAutoDisabled, setQwenPaperGateDaysRemaining } from '../middleware/prometheus-metrics';
import { getTracer } from '../shared/utils/tracing';
import { getMessageBus } from '../shared/messaging/create-message-bus';

export enum RollbackLayer {
  L0_SIGNALS = 'L0_SIGNALS',
  L1_KILL = 'L1_KILL',
  L2_DISABLED = 'L2_DISABLED',
  L3_DRAWDOWN = 'L3_DRAWDOWN',
  L4_PAPER_GATE = 'L4_PAPER_GATE',
}

export enum RollbackState {
  ACTIVE = 'ACTIVE',       // No layers blocking, trading allowed
  RESTRICTED = 'RESTRICTED', // Some restrictions (L4 paper gate, sizing limits)
  HALTED = 'HALTED',       // Temporary halt (L3 drawdown HALT, L0 signals issue)
  BLOCKED = 'BLOCKED',     // Hard block (L1 kill, L2 disabled, L3 HARD_STOP, L4 ineligible)
}

export interface LayerStatus {
  layer: RollbackLayer;
  active: boolean;
  reason?: string;
  expiresAt?: number; // for temporary blocks
  metadata?: Record<string, unknown>;
}

export interface RollbackStatus {
  overall: RollbackState;
  layers: LayerStatus[];
  lastUpdate: number;
  blockingLayers: RollbackLayer[];
}

export interface RollbackConfig {
  redisPrefix: string;
  signalsFreshnessThresholdMs: number; // 7h default
  paperGateMinDays: number;
  enableCrossInstanceSync: boolean;
}

const DEFAULT_CONFIG: RollbackConfig = {
  redisPrefix: 'rollback',
  signalsFreshnessThresholdMs: 7 * 60 * 60 * 1000,
  paperGateMinDays: 30,
  enableCrossInstanceSync: true,
};

export class TieredRollbackController {
  private config: RollbackConfig;
  private redis: RedisClientType;
  private statusCache: RollbackStatus | null = null;
  private cacheTtlMs: number = 5000; // cache status for 5s
  private lastCacheUpdate: number = 0;
  private subscriptionReady: boolean = false;

  constructor(config?: Partial<RollbackConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = getRedisClient();
  }

  /**
   * Get overall rollback status by aggregating all layers.
   * Cached for 5s to avoid excessive Redis/DB queries.
   */
  async getStatus(): Promise<RollbackStatus> {
    const now = Date.now();
    if (this.statusCache && (now - this.lastCacheUpdate) < this.cacheTtlMs) {
      return this.statusCache;
    }

    const layers: LayerStatus[] = [];
    const blockingLayers: RollbackLayer[] = [];

    // L0: Signals loop freshness
    const l0Status = await this.checkSignalsLoopHealth();
    layers.push(l0Status);
    if (l0Status.active) {
      blockingLayers.push(RollbackLayer.L0_SIGNALS);
    }

    // L1: Kill switch
    const l1Status = await this.checkKillSwitch();
    layers.push(l1Status);
    if (l1Status.active) {
      blockingLayers.push(RollbackLayer.L1_KILL);
    }

    // L2: Swarm disabled flag (in-memory or Redis)
    const l2Status = await this.checkSwarmDisabled();
    layers.push(l2Status);
    if (l2Status.active) {
      blockingLayers.push(RollbackLayer.L2_DISABLED);
    }

    // L3: Drawdown tier
    const l3Status = await this.checkDrawdownTier();
    layers.push(l3Status);
    if (l3Status.active) {
      blockingLayers.push(RollbackLayer.L3_DRAWDOWN);
    }

    // L4: Paper gate eligibility
    const l4Status = await this.checkPaperGate();
    layers.push(l4Status);
    if (l4Status.active && l4Status.metadata?.eligible === false) {
      blockingLayers.push(RollbackLayer.L4_PAPER_GATE);
    }

    // Determine overall state based on highest severity active layer
    let overall: RollbackState;

    // BLOCKED: Kill switch, swarm disabled, or HARD_STOP
    if (blockingLayers.includes(RollbackLayer.L1_KILL) ||
        blockingLayers.includes(RollbackLayer.L2_DISABLED) ||
        (blockingLayers.includes(RollbackLayer.L3_DRAWDOWN) && l3Status.metadata?.tier === 'HARD_STOP')) {
      overall = RollbackState.BLOCKED;
    }
    // HALTED: Signals loop stale or drawdown HALT tier or DAILY_PAUSE
    else if (blockingLayers.includes(RollbackLayer.L0_SIGNALS) ||
        (blockingLayers.includes(RollbackLayer.L3_DRAWDOWN) && (l3Status.metadata?.tier === 'HALT' || l3Status.metadata?.tier === 'DAILY_PAUSE'))) {
      overall = RollbackState.HALTED;
    }
    // RESTRICTED: Paper gate not ready, or drawdown ALERT/REDUCE tiers
    else if (blockingLayers.includes(RollbackLayer.L4_PAPER_GATE) ||
        (blockingLayers.includes(RollbackLayer.L3_DRAWDOWN) && (l3Status.metadata?.tier === 'ALERT' || l3Status.metadata?.tier === 'REDUCE'))) {
      overall = RollbackState.RESTRICTED;
    }
    // Otherwise ACTIVE
    else {
      overall = RollbackState.ACTIVE;
    }

    this.statusCache = {
      overall,
      layers,
      lastUpdate: now,
      blockingLayers,
    };
    this.lastCacheUpdate = now;

    return this.statusCache;
  }

  /**
   * Check if trading is currently allowed.
   * Returns false if any blocking layer is active.
   */
  async canTrade(): Promise<boolean> {
    const status = await this.getStatus();
    return status.overall === RollbackState.ACTIVE;
  }

  /**
   * Get list of blocking reasons (human-readable).
   */
  async getBlockingReasons(): Promise<string[]> {
    const status = await this.getStatus();
    return status.layers
      .filter(l => l.active && l.reason)
      .map(l => `[${l.layer}] ${l.reason}`);
  }

  // ========== Layer Checks ==========

  private async checkSignalsLoopHealth(): Promise<LayerStatus> {
    try {
      // Get last run timestamp from Redis (written by qwen-signals-loop)
      const lastRunStr = await this.redis.get('qwen:signals:last_run_ts');
      const lastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;
      const now = Date.now();
      const ageMs = now - lastRun;

      const freshnessThreshold = this.config.signalsFreshnessThresholdMs;
      const stale = ageMs > freshnessThreshold;

      // Also check error rate from metric? Could read from Prometheus or a Redis key.
      // For now, just freshness.
      return {
        layer: RollbackLayer.L0_SIGNALS,
        active: stale,
        reason: stale ? `Signals loop stale (last run ${(ageMs / 3600000).toFixed(1)}h ago)` : undefined,
        metadata: { lastRunTs: lastRun, ageMs },
        expiresAt: stale ? now + freshnessThreshold : undefined,
      };
    } catch (error) {
      logger.error('[Rollback] L0 check failed:', error);
      return {
        layer: RollbackLayer.L0_SIGNALS,
        active: true,
        reason: 'Unable to check signals loop health',
        metadata: { error: String(error) },
      };
    }
  }

  private async checkKillSwitch(): Promise<LayerStatus> {
    let killActive = process.env.QWEN_KILL === '1';
    // Also check Redis for cross-instance sync (if set via admin API)
    try {
      const redisKill = await this.redis.get('qwen:kill:active');
      if (redisKill === '1') killActive = true;
    } catch {
      // ignore
    }

    // Emit Prometheus metric for L1
    setQwenKillSwitch('env', killActive);

    return {
      layer: RollbackLayer.L1_KILL,
      active: killActive,
      reason: killActive ? 'Kill switch activated (QWEN_KILL=1)' : undefined,
    };
  }

  private async checkSwarmDisabled(): Promise<LayerStatus> {
    // Check in-memory flag from qwen-drawdown-monitor (exported as isQwenEnabled)
    // Since we're in a different module, we need a shared source. For now, check Redis.
    try {
      const disabled = await this.redis.get('qwen:disabled') === '1';
      return {
        layer: RollbackLayer.L2_DISABLED,
        active: disabled,
        reason: disabled ? 'Swarm disabled by drawdown breach or admin' : undefined,
      };
    } catch {
      return { layer: RollbackLayer.L2_DISABLED, active: false };
    }
  }

  private async checkDrawdownTier(): Promise<LayerStatus> {
    try {
      const tier = await this.redis.hget('drawdown:state', 'tier') as string | null;
      const tierUpper = tier?.toUpperCase();

      // Any tier other than NORMAL (and not null) indicates drawdown condition
      const active = tierUpper ? tierUpper !== 'NORMAL' : false;

      return {
        layer: RollbackLayer.L3_DRAWDOWN,
        active,
        reason: active ? `Drawdown tier: ${tierUpper}` : undefined,
        metadata: { tier: tierUpper || 'NORMAL' },
      };
    } catch {
      return { layer: RollbackLayer.L3_DRAWDOWN, active: false };
    }
  }

  private async checkPaperGate(): Promise<LayerStatus> {
    try {
      // Check QWEN_LIVE_ELIGIBLE env flag
      const liveEligible = process.env.QWEN_LIVE_ELIGIBLE === 'true';
      if (!liveEligible) {
        setQwenPaperGateDaysRemaining(this.config.paperGateMinDays);
        return {
          layer: RollbackLayer.L4_PAPER_GATE,
          active: true,
          reason: 'Live eligibility not enabled (QWEN_LIVE_ELIGIBLE != true)',
          metadata: { eligible: false },
        };
      }

      // Check first trade age from DB (could be cached in Redis)
      const ageMs = await this.getQwenFirstTradeAgeMs();
      const daysRemaining = ageMs !== null
        ? Math.max(0, (this.config.paperGateMinDays * 24 * 60 * 60 * 1000 - ageMs) / (24 * 60 * 60 * 1000))
        : this.config.paperGateMinDays;

      setQwenPaperGateDaysRemaining(daysRemaining);

      if (ageMs === null) {
        return {
          layer: RollbackLayer.L4_PAPER_GATE,
          active: true,
          reason: 'No paper trades recorded yet',
          metadata: { eligible: false, daysRemaining: this.config.paperGateMinDays },
        };
      }

      if (ageMs < this.config.paperGateMinDays * 24 * 60 * 60 * 1000) {
        return {
          layer: RollbackLayer.L4_PAPER_GATE,
          active: true,
          reason: `${daysRemaining.toFixed(1)}d remaining in paper validation`,
          metadata: { eligible: false, daysRemaining },
        };
      }

      return {
        layer: RollbackLayer.L4_PAPER_GATE,
        active: false,
        reason: undefined,
        metadata: { eligible: true, daysRemaining: 0 },
      };
    } catch (error) {
      logger.error('[Rollback] L4 check failed:', error);
      return {
        layer: RollbackLayer.L4_PAPER_GATE,
        active: true,
        reason: 'Unable to verify paper gate eligibility',
        metadata: { error: String(error) },
      };
    }
  }

  private async getQwenFirstTradeAgeMs(): Promise<number | null> {
    // Try Redis cache first (key: qwen:paper:first_trade_age_ms, TTL 5min)
    try {
      const cached = await this.redis.get('qwen:paper:first_trade_age_ms');
      if (cached) return parseInt(cached, 10);
    } catch {
      // ignore
    }

    // Query DB - we don't have direct DB access here, so we'll use a Redis key
    // that is populated by a separate job (paper-trading-orchestrator). For now, return null.
    // In production, the paper-trading-orchestrator would update this.
    return null;
  }

  // ========== Admin Controls ==========

  /**
   * Activate L1 kill switch (emergency stop)
   */
  async kill(reason: string): Promise<void> {
    process.env.QWEN_KILL = '1';
    await this.redis.set('qwen:kill:active', '1');
    await this.redis.publish('rollback:event', JSON.stringify({
      layer: RollbackLayer.L1_KILL,
      action: 'kill',
      reason,
      timestamp: Date.now(),
    }));
    this.invalidateCache();
    logger.warn('[Rollback] Kill switch activated', { reason });
  }

  /**
   * Deactivate L1 kill switch (manual recovery)
   */
  async unkill(reason: string): Promise<void> {
    process.env.QWEN_KILL = '0';
    await this.redis.del('qwen:kill:active');
    await this.redis.publish('rollback:event', JSON.stringify({
      layer: RollbackLayer.L1_KILL,
      action: 'unkill',
      reason,
      timestamp: Date.now(),
    }));
    this.invalidateCache();
    logger.info('[Rollback] Kill switch deactivated', { reason });
  }

  /**
   * Programmatically disable swarm (L2) - used by drawdown breach, system errors
   */
  async disableSwarm(reason: string): Promise<void> {
    await this.redis.set('qwen:disabled', '1');
    setQwenDrawdownAutoDisabled(true);
    await this.redis.publish('rollback:event', JSON.stringify({
      layer: RollbackLayer.L2_DISABLED,
      action: 'disable',
      reason,
      timestamp: Date.now(),
    }));
    this.invalidateCache();
    logger.warn('[Rollback] Swarm disabled', { reason });
  }

  /**
   * Re-enable swarm after L2 disable
   */
  async enableSwarm(reason: string): Promise<void> {
    await this.redis.del('qwen:disabled');
    setQwenDrawdownAutoDisabled(false);
    await this.redis.publish('rollback:event', JSON.stringify({
      layer: RollbackLayer.L2_DISABLED,
      action: 'enable',
      reason,
      timestamp: Date.now(),
    }));
    this.invalidateCache();
    logger.info('[Rollback] Swarm re-enabled', { reason });
  }

  /**
   * Acknowledge a rollback event (for automated recovery flows)
   */
  async acknowledge(layer: RollbackLayer, reason: string): Promise<void> {
    await this.redis.publish('rollback:ack', JSON.stringify({
      layer,
      reason,
      timestamp: Date.now(),
    }));
    logger.info('[Rollback] Acknowledged', { layer, reason });
  }

  /**
   * Force-set paper gate eligibility (for testing/admin override)
   */
  async setPaperGateEligible(eligible: boolean, reason: string): Promise<void> {
    if (eligible) {
      await this.redis.del('qwen:paper:ineligible');
    } else {
      await this.redis.set('qwen:paper:ineligible', '1');
    }
    await this.redis.publish('rollback:event', JSON.stringify({
      layer: RollbackLayer.L4_PAPER_GATE,
      action: eligible ? 'eligible' : 'ineligible',
      reason,
      timestamp: Date.now(),
    }));
    this.invalidateCache();
    logger.info('[Rollback] Paper gate eligibility updated', { eligible, reason });
  }

  private invalidateCache(): void {
    this.statusCache = null;
  }

  // ========== Event Subscription ==========

  /**
   * Subscribe to rollback state changes from other instances.
   * Call during application startup.
   */
  async subscribeCrossInstanceUpdates(): Promise<void> {
    if (!this.config.enableCrossInstanceSync) return;

    try {
      const bus = getMessageBus();
      await bus.subscribe('rollback.state', (envelope: any) => {
        const { layer, action, reason, timestamp } = envelope.data;
        logger.info('[Rollback] Received cross-instance update', { layer, action, reason });
        this.invalidateCache();
      });
      this.subscriptionReady = true;
      logger.info('[Rollback] Subscribed to cross-instance state updates');
    } catch {
      logger.debug('[Rollback] Message bus not available — cross-instance sync disabled');
    }
  }
}

// Singleton instance
let rollbackControllerInstance: TieredRollbackController | null = null;

export function getRollbackController(config?: Partial<RollbackConfig>): TieredRollbackController {
  if (!rollbackControllerInstance) {
    rollbackControllerInstance = new TieredRollbackController(config);
  }
  return rollbackControllerInstance;
}
