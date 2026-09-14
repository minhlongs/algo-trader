import type { OrderResult } from './order-executor';

export interface RollbackResult {
  success: boolean;
  action: 'CLOSE_LONG' | 'CLOSE_SHORT' | 'CANCEL_PENDING' | 'NO_ACTION';
  closedOrder?: OrderResult;
  loss: number;
  reason: string;
  timestamp: number;
}

export interface RollbackConfig {
  autoRollback: boolean;
  maxLossPercent: number;
  rollbackTimeoutMs: number;
  retryAttempts: number;
}

export const DEFAULT_ROLLBACK_CONFIG: RollbackConfig = {
  autoRollback: true,
  maxLossPercent: 2.0,
  rollbackTimeoutMs: 10000,
  retryAttempts: 3,
};
