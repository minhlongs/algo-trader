/**
 * Dark Pool & Block Trading Gateway Types
 *
 * @module desk/darkpool/darkpool-types
 */

export type DarkPegType = 'MIDPOINT' | 'PRIMARY' | 'MARKET' | 'CUSTOM_LIMIT';

export interface DarkOrder {
  readonly orderId: string;
  readonly participantId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: number;
  readonly minExecutionQuantity?: number;
  readonly pegType: DarkPegType;
  readonly limitPrice?: number;
  readonly timestampMs: number;
}

export interface CrossingMatch {
  readonly matchId: string;
  readonly symbol: string;
  readonly buyOrderId: string;
  readonly sellOrderId: string;
  readonly matchedQuantity: number;
  readonly executionPrice: number;
  readonly timestampMs: number;
}

export interface AntiGamingConfig {
  readonly maxOrderRatePerSec: number;
  readonly minRestingTimeMs: number;
  readonly cancellationRatioThreshold: number;
  readonly smallOrderSniffingThreshold: number;
}

export interface IndicationOfInterest {
  readonly ioiId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly sizeTier: 'SMALL' | 'MEDIUM' | 'LARGE' | 'BLOCK';
  readonly naturalInterest: boolean;
  readonly expiryTimestampMs: number;
}
