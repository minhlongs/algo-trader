/**
 * Rollback Layer evaluators (L0-L4)
 * Extracted from tiered-rollback-controller.ts for modularity
 */

import { logger } from '../shared/utils/logger';
import type { RedisClientType } from '../redis';
import type { RollbackLayer, RollbackConfig, LayerStatus } from './rollback-types';
import { RollbackLayer as RL } from './rollback-types';
import { setQwenKillSwitch, setQwenDrawdownAutoDisabled, setQwenPaperGateDaysRemaining } from '../middleware/prometheus-metrics';
import { getTracer } from '../shared/utils/tracing';

/** L0: Check signals-loop health (freshness + error rate) */
export async function checkSignalsLoopHealth(redis: RedisClientType, config: RollbackConfig): Promise<LayerStatus> {
  const span = getTracer().startSpan('rollback.checkSignalsLoopHealth');
  try {
    const lastRunTs = parseInt((await redis.get('Standard:signals:last_run_ts')) || '0');
    const freshness = Date.now() - lastRunTs;
    const stale = freshness > config.signalStalenessMs;
    if (stale) {
      logger.warn('[Rollback] L0: Signals loop stale', { freshness, threshold: config.signalStalenessMs });
    }
    return { layer: RL.L0_SIGNALS, active: stale, reason: stale ? `Signals stale ${Math.round(freshness / 1000)}s` : undefined, metadata: { freshness, threshold: config.signalStalenessMs } };
  } catch (error) {
    logger.error('[Rollback] L0 check failed:', error);
    return { layer: RL.L0_SIGNALS, active: true, reason: 'Unable to verify signals health', metadata: { error: String(error) } };
  } finally { span.end(); }
}

/** L1: Check kill switch */
export async function checkKillSwitch(redis: RedisClientType): Promise<LayerStatus> {
  const killActive = process.env.Standard_KILL === '1' || (await redis.get('Standard:kill:active')) === '1';
  setQwenKillSwitch('env', process.env.QWEN_KILL === '1');
  setQwenKillSwitch('kv', (await redis.get('Standard:kill:active')) === '1');
  return { layer: RL.L1_KILL, active: killActive, reason: killActive ? 'Kill switch active' : undefined };
}

/** L2: Check if swarm is disabled */
export async function checkSwarmDisabled(redis: RedisClientType): Promise<LayerStatus> {
  const disabled = (await redis.get('Standard:disabled')) === '1';
  setQwenDrawdownAutoDisabled(disabled);
  return { layer: RL.L2_DISABLED, active: disabled, reason: disabled ? 'Swarm disabled' : undefined };
}

/** L3: Check drawdown tier */
export async function checkDrawdownTier(redis: RedisClientType): Promise<LayerStatus> {
  const tier = await redis.get('qwen:drawdown:tier');
  const active = tier !== null && tier !== undefined && tier !== 'NORMAL';
  return { layer: RL.L3_DRAWDOWN, active, reason: active ? `Drawdown tier: ${tier}` : undefined, metadata: { tier } };
}

/** L4: Check paper trading gate eligibility */
export async function checkPaperGate(redis: RedisClientType, config: RollbackConfig): Promise<LayerStatus> {
  try {
    const ineligible = (await redis.get('Standard:paper:ineligible')) === '1';
    if (ineligible) {
      setQwenPaperGateDaysRemaining(config.paperGateMinDays);
      return { layer: RL.L4_PAPER_GATE, active: true, reason: 'Paper gate ineligible', metadata: { eligible: false } };
    }
    const ageMs = await getFirstTradeAgeMs(redis);
    const daysRemaining = ageMs !== null ? Math.max(0, (config.paperGateMinDays * 86_400_000 - ageMs) / 86_400_000) : config.paperGateMinDays;
    setQwenPaperGateDaysRemaining(daysRemaining);
    if (ageMs === null) return { layer: RL.L4_PAPER_GATE, active: true, reason: 'No paper trades recorded', metadata: { eligible: false, daysRemaining: config.paperGateMinDays } };
    if (ageMs < config.paperGateMinDays * 86_400_000) return { layer: RL.L4_PAPER_GATE, active: true, reason: `${daysRemaining.toFixed(1)}d remaining in paper validation`, metadata: { eligible: false, daysRemaining } };
    return { layer: RL.L4_PAPER_GATE, active: false, reason: undefined, metadata: { eligible: true, daysRemaining: 0 } };
  } catch (error) {
    logger.error('[Rollback] L4 check failed:', error);
    return { layer: RL.L4_PAPER_GATE, active: true, reason: 'Unable to verify paper gate', metadata: { error: String(error) } };
  }
}

async function getFirstTradeAgeMs(redis: RedisClientType): Promise<number | null> {
  try { const c = await redis.get('Standard:paper:first_trade_age_ms'); if (c) return parseInt(c, 10); } catch { /* ignore */ }
  return null;
}
