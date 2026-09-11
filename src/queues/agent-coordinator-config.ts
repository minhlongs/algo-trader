/**
 * Agent Coordinator Configuration & Priority Helpers
 */

import type { JobsOptions } from 'bullmq';
import { AgentPriority } from './agent-coordinator-types';

export interface QueuePriorityDefinition {
  priority: AgentPriority;
  name: string;
  concurrency: number;
  rateLimit: number; // per second
}

export const QUEUE_DEFINITIONS: readonly QueuePriorityDefinition[] = [
  {
    priority: AgentPriority.CRITICAL,
    name: 'agent-critical',
    concurrency: 5,
    rateLimit: 100,
  },
  {
    priority: AgentPriority.NORMAL,
    name: 'agent-normal',
    concurrency: 15,
    rateLimit: 50,
  },
  {
    priority: AgentPriority.BACKGROUND,
    name: 'agent-background',
    concurrency: 30,
    rateLimit: 20,
  },
] as const;

export function getConcurrencyForPriority(priority: AgentPriority): number {
  switch (priority) {
    case AgentPriority.CRITICAL:
      return 5;
    case AgentPriority.NORMAL:
      return 15;
    case AgentPriority.BACKGROUND:
      return 30;
  }
}

export function getRateLimitForPriority(priority: AgentPriority): number {
  switch (priority) {
    case AgentPriority.CRITICAL:
      return 100;
    case AgentPriority.NORMAL:
      return 50;
    case AgentPriority.BACKGROUND:
      return 20;
  }
}

export function getDefaultTimeout(priority: AgentPriority): number {
  switch (priority) {
    case AgentPriority.CRITICAL:
      return 3000;
    case AgentPriority.NORMAL:
      return 10000;
    case AgentPriority.BACKGROUND:
      return 30000;
  }
}

export function getDefaultJobOptions(priority: AgentPriority): JobsOptions {
  return {
    removeOnComplete: { count: 100, age: 24 * 60 * 60 * 1000 },
    removeOnFail: { count: 500, age: 24 * 60 * 60 * 1000 },
    attempts: priority === AgentPriority.CRITICAL ? 1 : 3,
    backoff: {
      type: 'exponential',
      delay: priority === AgentPriority.BACKGROUND ? 10000 : 2000,
    },
  };
}
