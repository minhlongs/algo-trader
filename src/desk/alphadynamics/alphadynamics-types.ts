/**
 * HFT Order Flow Dynamics & Alpha Synthesis Types
 * Multi-level OFI, Kyle-Obizhaeva kernels, Queue Stuffing, and Kalman Alpha Filter types.
 *
 * @module desk/alphadynamics/alphadynamics-types
 */

export interface LimitOrderLevel {
  price: number;
  size: number;
}

export interface OrderBookSnapshot {
  timestampMs: number;
  symbol: string;
  bids: LimitOrderLevel[]; // sorted desc by price
  asks: LimitOrderLevel[]; // sorted asc by price
}

export interface MultiLevelOfiResult {
  symbol: string;
  timestampMs: number;
  levelOfi: number[];
  integratedOfi: number;
  decayWeightedOfi: number;
  normalizedOfiZScore: number;
}

export interface OrderBookEvent {
  timestampMs: number;
  eventType: 'NEW' | 'CANCEL' | 'TRADE' | 'REPLACE';
  orderId: string;
  price: number;
  size: number;
}

export interface QueueStuffingAlert {
  isAnomalyDetected: boolean;
  cancelToTradeRatio: number;
  eventFrequencyHz: number;
  burstSeverityScore: number; // 0.0 to 1.0
  isQueueStuffed: boolean;
}

export interface AlphaObservation {
  timestampMs: number;
  alphaSignalValues: number[]; // e.g. [OFI, MicroPriceTrend, BookImbalance]
  realizedPriceChange: number;
}

export interface KalmanAlphaState {
  weights: number[];
  covarianceMatrix: number[][];
  predictedReturn: number;
  estimationVariance: number;
  kalmanGain: number[];
}
