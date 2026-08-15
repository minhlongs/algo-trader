/**
 * Tiered Rollback Controller (L0-L4)
 * Centralized orchestrator for runtime safety layers with cross-instance coordination.
 */

import { getRedisClient, type RedisClientType } from '../redis';
import { logger } from '../shared/utils/logger';
import { getMessageBus } from '../shared/messaging/create-message-bus';
import type { MessageEnvelope } from '../shared/messaging/message-bus-interface';
import type { RollbackLayer, RollbackConfig, RollbackStatus, LayerStatus } from './rollback-types';
import { RollbackState, RollbackLayer as RL, DEFAULT_ROLLBACK_CONFIG, overallStateFromLayer, getEffectiveSeverity } from './rollback-types';
import { checkSignalsLoopHealth, checkKillSwitch, checkSwarmDisabled, checkDrawdownTier, checkPaperGate } from './rollback-evaluators';

// Re-export types for backward compatibility
export { RollbackLayer, RollbackState } from './rollback-types';
export type { RollbackStatus, LayerStatus, RollbackConfig };

export class TieredRollbackController {
  private redis: RedisClientType;
  private config: RollbackConfig;
  private statusCache: RollbackStatus | null = null;
  private cacheValidMs = 2000;
  private lastCacheTime = 0;
  private subscriptionReady = false;

  constructor(config?: Partial<RollbackConfig>) {
    this.redis = getRedisClient();
    this.config = { ...DEFAULT_ROLLBACK_CONFIG, ...config };
  }

  async getStatus(): Promise<RollbackStatus> {
    if (this.statusCache && Date.now() - this.lastCacheTime < this.cacheValidMs) return this.statusCache;
    const layers: LayerStatus[] = await Promise.all([
      checkSignalsLoopHealth(this.redis, this.config),
      checkKillSwitch(this.redis),
      checkSwarmDisabled(this.redis),
      checkDrawdownTier(this.redis),
      checkPaperGate(this.redis, this.config),
    ]);
    const activeLayer = layers.filter(l => l.active).sort((a, b) => getEffectiveSeverity(b.layer, b.metadata) - getEffectiveSeverity(a.layer, a.metadata))[0]?.layer ?? null;
    const activeLayerStatus = layers.find(l => l.active && l.layer === activeLayer);
    const overallSeverity = activeLayer ? getEffectiveSeverity(activeLayer, activeLayerStatus?.metadata) : 0;
    const overall = overallSeverity >= 5 ? RollbackState.BLOCKED : overallSeverity >= 4 ? RollbackState.BLOCKED : overallSeverity >= 3 ? RollbackState.HALTED : overallSeverity >= 1 ? RollbackState.RESTRICTED : RollbackState.ACTIVE;
    const status: RollbackStatus = { overall, layers, lastChecked: Date.now() };
    this.statusCache = status;
    this.lastCacheTime = Date.now();
    return status;
  }

  async isTradingAllowed(): Promise<boolean> { return (await this.getStatus()).overall === RollbackState.ACTIVE; }

  // ── Admin Controls ─────────────────────────────────────────────────────────

  async kill(reason: string): Promise<void> {
    process.env.Standard_KILL = '1';
    await this.redis.set('Standard:kill:active', '1');
    await this.redis.publish('rollback:event', JSON.stringify({ layer: RL.L1_KILL, action: 'kill', reason, timestamp: Date.now() }));
    this.invalidateCache();
    logger.warn('[Rollback] Kill switch activated', { reason });
  }

  async unkill(reason: string): Promise<void> {
    process.env.Standard_KILL = '0';
    await this.redis.del('Standard:kill:active');
    await this.redis.publish('rollback:event', JSON.stringify({ layer: RL.L1_KILL, action: 'unkill', reason, timestamp: Date.now() }));
    this.invalidateCache();
    logger.info('[Rollback] Kill switch deactivated', { reason });
  }

  async disableSwarm(reason: string): Promise<void> {
    await this.redis.set('Standard:disabled', '1');
    await this.redis.publish('rollback:event', JSON.stringify({ layer: RL.L2_DISABLED, action: 'disable', reason, timestamp: Date.now() }));
    this.invalidateCache();
    logger.warn('[Rollback] Swarm disabled', { reason });
  }

  async enableSwarm(reason: string): Promise<void> {
    await this.redis.del('Standard:disabled');
    await this.redis.publish('rollback:event', JSON.stringify({ layer: RL.L2_DISABLED, action: 'enable', reason, timestamp: Date.now() }));
    this.invalidateCache();
    logger.info('[Rollback] Swarm re-enabled', { reason });
  }

  async acknowledge(layer: RollbackLayer, reason: string): Promise<void> {
    await this.redis.publish('rollback:ack', JSON.stringify({ layer, reason, timestamp: Date.now() }));
    logger.info('[Rollback] Acknowledged', { layer, reason });
  }

  async setPaperGateEligible(eligible: boolean, reason: string): Promise<void> {
    if (eligible) await this.redis.del('Standard:paper:ineligible');
    else await this.redis.set('Standard:paper:ineligible', '1');
    await this.redis.publish('rollback:event', JSON.stringify({ layer: RL.L4_PAPER_GATE, action: eligible ? 'eligible' : 'ineligible', reason, timestamp: Date.now() }));
    this.invalidateCache();
    logger.info('[Rollback] Paper gate eligibility updated', { eligible, reason });
  }

  async subscribeCrossInstanceUpdates(): Promise<void> {
    if (!this.config.enableCrossInstanceSync) return;
    try {
      const bus = getMessageBus();
      await bus.subscribe('rollback.state', (_envelope: MessageEnvelope<Record<string, unknown>>) => {
        this.invalidateCache();
      });
      this.subscriptionReady = true;
    } catch { logger.debug('[Rollback] Message bus not available — cross-instance sync disabled'); }
  }

  private invalidateCache(): void { this.statusCache = null; }
}

let rollbackControllerInstance: TieredRollbackController | null = null;
export function getRollbackController(config?: Partial<RollbackConfig>): TieredRollbackController {
  if (!rollbackControllerInstance) rollbackControllerInstance = new TieredRollbackController(config);
  return rollbackControllerInstance;
}
