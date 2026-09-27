/**
 * Execution and order lifecycle contracts for MARL market-making.
 * Defines order states, execution requests, fill events, and engine interfaces.
 */

export type MarlOrderState =
  | 'PENDING'
  | 'ACTIVE'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'EXPIRED';

export type MarlOrderSide = 'buy' | 'sell';

export type MarlOrderType = 'limit' | 'market' | 'ioc';

export interface MarlLimitOrder {
  orderId: string;
  agentId: string;
  symbol: string;
  venue: string;
  side: MarlOrderSide;
  type: MarlOrderType;
  price: number;
  amount: number;
  filledAmount: number;
  remainingAmount: number;
  status: MarlOrderState;
  createdAt: number;
  updatedAt: number;
  queuePosition?: number;
}

export interface MarlFillEvent {
  fillId: string;
  orderId: string;
  agentId: string;
  symbol: string;
  venue: string;
  side: MarlOrderSide;
  price: number;
  amount: number;
  fee: number;
  liquidity: 'maker' | 'taker';
  timestamp: number;
}

export interface MarlOrderPlacementParams {
  agentId: string;
  symbol: string;
  venue: string;
  side: MarlOrderSide;
  type: MarlOrderType;
  price: number;
  amount: number;
}

export interface MarlExecutionContract {
  placeLimitOrder(params: MarlOrderPlacementParams): Promise<MarlLimitOrder>;
  cancelOrder(orderId: string): Promise<boolean>;
  cancelAllOrders(symbol?: string): Promise<number>;
  getActiveOrders(symbol?: string): MarlLimitOrder[];
}
