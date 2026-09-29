/**
 * Engine Supervisor
 * Milestone M3: Concurrent Multi-Engine Background Supervisor & Worker Daemon
 *
 * Concurrently launches and supervises signal generators for all 4 autonomous engines:
 * Arbitrage, MARL Market Making, Prediction Market AMM Liquidity, Alpha-Lab Quant.
 */

import { logger } from '../../shared/utils/logger';
import { ENGINE_IDS, type EngineId } from '../portfolio/types';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import { SignalNormalizer } from '../orchestrator/signal-normalizer';
import type {
  EngineStatus,
  EngineSupervisorOptions,
  IEngineSupervisor,
  ISupervisedEngine,
} from './engine-supervisor-types';

export class SupervisedEngine implements ISupervisedEngine {
  public status: EngineStatus = 'STOPPED';
  public lastSignalTime?: number;
  public errorMessage?: string;
  private queuedIntents: UnifiedTradeIntent[] = [];
  private shouldFailPoll = false;
  private pollErrorMessage = 'Engine poll failed';

  constructor(
    public readonly engineId: EngineId,
    private readonly normalizer: SignalNormalizer = new SignalNormalizer(),
  ) {}

  public async start(): Promise<void> {
    this.status = 'RUNNING';
    this.errorMessage = undefined;
  }

  public async stop(): Promise<void> {
    this.status = 'STOPPED';
  }

  public setQueue(intents: UnifiedTradeIntent[]): void {
    this.queuedIntents = [...intents];
  }

  public setFailOnPoll(fail: boolean, message = 'Engine poll failed'): void {
    this.shouldFailPoll = fail;
    this.pollErrorMessage = message;
  }

  public enqueueRaw(rawSignal: unknown, type = 'default'): void {
    if (!rawSignal) return;
    try {
      let intents: UnifiedTradeIntent[] = [];
      if (this.engineId === 'arbitrage') {
        intents = this.normalizer.normalizeArbitrage(rawSignal as Parameters<SignalNormalizer['normalizeArbitrage']>[0]);
      } else if (this.engineId === 'marl') {
        intents = type === 'order'
          ? [this.normalizer.normalizeMarlOrder(rawSignal as Parameters<SignalNormalizer['normalizeMarlOrder']>[0])]
          : this.normalizer.normalizeMarlQuote(rawSignal as Parameters<SignalNormalizer['normalizeMarlQuote']>[0]);
      } else if (this.engineId === 'amm') {
        if (type === 'rebalance') {
          intents = [this.normalizer.normalizeAmmRebalance(rawSignal as Parameters<SignalNormalizer['normalizeAmmRebalance']>[0])];
        } else if (type === 'arbitrage') {
          intents = this.normalizer.normalizeAmmArbitrage(rawSignal as Parameters<SignalNormalizer['normalizeAmmArbitrage']>[0]);
        } else {
          intents = this.normalizer.normalizeAmmQuote(rawSignal as Parameters<SignalNormalizer['normalizeAmmQuote']>[0], 'BTC/USDT');
        }
      } else if (this.engineId === 'alpha-lab') {
        intents = type === 'trade'
          ? [this.normalizer.normalizeTradeSignal(rawSignal as Parameters<SignalNormalizer['normalizeTradeSignal']>[0])]
          : [this.normalizer.normalizeAlphaSignal(rawSignal as Parameters<SignalNormalizer['normalizeAlphaSignal']>[0])];
      }
      this.queuedIntents.push(...intents);
    } catch (err) {
      logger.warn(`[SupervisedEngine:${this.engineId}] Failed to normalize raw signal`, { error: String(err) });
    }
  }

  public async poll(): Promise<UnifiedTradeIntent[]> {
    if (this.shouldFailPoll) {
      this.status = 'ERROR';
      this.errorMessage = this.pollErrorMessage;
      throw new Error(this.pollErrorMessage);
    }
    if (this.status === 'ERROR') {
      this.status = 'RUNNING';
      this.errorMessage = undefined;
    }
    if (this.status !== 'RUNNING') return [];
    const intents = [...this.queuedIntents];
    this.queuedIntents = [];
    if (intents.length > 0) {
      this.lastSignalTime = Date.now();
    }
    return intents;
  }
}

export class EngineSupervisor implements IEngineSupervisor {
  public readonly engines = new Map<EngineId, ISupervisedEngine>();
  private readonly isolateErrors: boolean;

  constructor(options: EngineSupervisorOptions = {}) {
    const normalizer = options.normalizer ?? new SignalNormalizer();
    this.isolateErrors = options.isolateErrors ?? true;

    if (options.engines) {
      if (options.engines instanceof Map) {
        for (const [id, e] of options.engines.entries()) this.engines.set(id, e);
      } else {
        for (const e of options.engines) this.engines.set(e.engineId, e);
      }
    }

    for (const id of ENGINE_IDS) {
      if (!this.engines.has(id)) {
        this.engines.set(id, new SupervisedEngine(id, normalizer));
      }
    }
  }

  public async start(): Promise<void> {
    await Promise.all(Array.from(this.engines.values()).map((e) => e.start()));
    logger.info('[EngineSupervisor] Concurrently started all 4 trading engines');
  }

  public async stop(): Promise<void> {
    await Promise.all(Array.from(this.engines.values()).map((e) => e.stop()));
    logger.info('[EngineSupervisor] Stopped all trading engines');
  }

  public async pollCycle(): Promise<UnifiedTradeIntent[]> {
    const entries = Array.from(this.engines.entries());
    const results = await Promise.allSettled(entries.map(([, engine]) => engine.poll()));
    const collected: UnifiedTradeIntent[] = [];

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const [id] = entries[i];
      if (res.status === 'fulfilled') {
        collected.push(...res.value);
      } else {
        const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
        logger.warn(`[EngineSupervisor] Engine ${id} poll failed: ${msg}`);
        if (!this.isolateErrors) throw res.reason;
      }
    }
    return collected;
  }

  public getEngineStatuses(): Record<string, { status: string; lastSignalTime?: number; error?: string }> {
    const statuses: Record<string, { status: string; lastSignalTime?: number; error?: string }> = {};
    for (const [id, engine] of this.engines.entries()) {
      statuses[id] = {
        status: engine.status,
        lastSignalTime: engine.lastSignalTime,
        error: engine.errorMessage,
      };
    }
    return statuses;
  }

  public getEngine(engineId: EngineId): ISupervisedEngine | undefined {
    return this.engines.get(engineId);
  }

  public isRunning(): boolean {
    return Array.from(this.engines.values()).some((e) => e.status === 'RUNNING');
  }
}
