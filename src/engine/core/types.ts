export interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  status: 'open' | 'filled' | 'cancelled';
  timestamp: number;
}

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'filled' | 'cancelled';
