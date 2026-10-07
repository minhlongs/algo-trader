export interface Tick {
  id: string;
  price: number;
  timestamp: number;
  side?: 'buy' | 'sell';
  volume?: number;
}
