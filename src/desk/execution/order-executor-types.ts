/**
 * Order Execution Types and Configuration
 */

export interface ExecutionResult {
  id: string;
  opportunityId: string;
  status: 'PENDING' | 'EXECUTING' | 'FILLED' | 'PARTIAL' | 'FAILED' | 'ROLLBACK' | 'CANCELED';
  buyOrder?: OrderResult;
  sellOrder?: OrderResult;
  profit?: number;
  error?: string;
  timestamp: number;
}

export interface OrderResult {
  orderId: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  filled: number;
  remaining: number;
  status: 'open' | 'closed' | 'canceled' | 'rejected';
  fee?: number;
}

export interface ExecutionConfig {
  defaultAmount: number;
  maxSlippage: number;
  timeoutMs: number;
  retryAttempts: number;
}
