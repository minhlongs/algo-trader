/**
 * Engine Supervisor Types & Contracts
 * Milestone M3: Concurrent Multi-Engine Background Supervisor & Worker Daemon
 */

import * as z from 'zod';
import type { EngineId } from '../portfolio/types';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import type { SignalNormalizer } from '../orchestrator/signal-normalizer';

export const EngineStatusSchema = z.enum([
  'STOPPED',
  'STARTING',
  'RUNNING',
  'PAUSED',
  'ERROR',
]);
export type EngineStatus = z.infer<typeof EngineStatusSchema>;

export const SupervisedEngineStatusSchema = z.object({
  status: EngineStatusSchema,
  lastSignalTime: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  cycleCount: z.number().int().nonnegative().optional(),
});
export type SupervisedEngineStatus = z.infer<typeof SupervisedEngineStatusSchema>;

export interface ISupervisedEngine {
  readonly engineId: EngineId;
  readonly status: EngineStatus;
  readonly lastSignalTime?: number;
  readonly errorMessage?: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  poll(): Promise<UnifiedTradeIntent[]>;
  setQueue?(intents: UnifiedTradeIntent[]): void;
  setFailOnPoll?(fail: boolean, message?: string): void;
  enqueueRaw?(rawSignal: unknown, type?: string): void;
}

export interface EngineSupervisorOptions {
  readonly normalizer?: SignalNormalizer;
  readonly engines?: ISupervisedEngine[] | Map<EngineId, ISupervisedEngine>;
  readonly pollTimeoutMs?: number;
  readonly isolateErrors?: boolean;
}

export interface IEngineSupervisor {
  readonly engines: Map<EngineId, ISupervisedEngine>;
  start(): Promise<void>;
  pollCycle(): Promise<UnifiedTradeIntent[]>;
  stop(): Promise<void>;
  getEngineStatuses(): Record<string, { status: string; lastSignalTime?: number; error?: string }>;
  getEngine(engineId: EngineId): ISupervisedEngine | undefined;
  isRunning(): boolean;
}
