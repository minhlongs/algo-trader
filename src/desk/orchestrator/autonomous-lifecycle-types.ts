/**
 * Autonomous Lifecycle Types & Transition Schemas (Milestone 4 - R4)
 */

import { z } from 'zod';

export const AutonomousLifecycleStateSchema = z.enum([
  'INITIALIZING',
  'RUNNING',
  'PAUSED',
  'STOPPED',
  'EMERGENCY_HALT',
]);
export type AutonomousLifecycleState = z.infer<typeof AutonomousLifecycleStateSchema>;

export const LifecycleTransitionRecordSchema = z.object({
  fromState: AutonomousLifecycleStateSchema,
  toState: AutonomousLifecycleStateSchema,
  timestamp: z.number().int().positive(),
  reason: z.string(),
  latencyMs: z.number().nonnegative(),
});
export type LifecycleTransitionRecord = z.infer<typeof LifecycleTransitionRecordSchema>;

export interface EmergencyHaltResult {
  readonly success: boolean;
  readonly latencyMs: number;
  readonly state: AutonomousLifecycleState;
  readonly reason: string;
}
