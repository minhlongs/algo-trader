/** Base strategy interface. */
export interface IStrategy {
  execute(marketData: Record<string, unknown>):
    | { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; metadata?: Record<string, unknown> }
    | Promise<{ signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; metadata?: Record<string, unknown> }>;

  onTick?(marketData: Record<string, unknown>):
    | { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; metadata?: Record<string, unknown> }
    | Promise<{ signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; metadata?: Record<string, unknown> }>;
}
