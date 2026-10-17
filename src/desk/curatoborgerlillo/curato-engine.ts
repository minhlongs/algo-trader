/**
 * Wave 230: Curato, Borger & Lillo (2017) Optimal Execution with Endogenous Queue Transitions Engine.
 * Strictly < 200 LOC, zero :any.
 */

import { QueueDynamicsConfig, LimitOrderQueueState, ExecutionDecision } from './curato-types';
import { CuratoMath } from './curato-math';

export class CuratoQueueEngine {
  constructor(private readonly config: QueueDynamicsConfig) {}

  public getFillProbability(queuePosition: number): number {
    return CuratoMath.computeFillProbability(this.config, queuePosition);
  }

  public evaluateExecution(state: LimitOrderQueueState): ExecutionDecision {
    return CuratoMath.decideAction(this.config, state);
  }
}
