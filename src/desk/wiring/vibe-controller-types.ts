/**
 * Vibe Controller Types & Constants.
 */

export type TradingMode = 'conservative' | 'balanced' | 'aggressive' | 'defensive';

export interface VibeState {
  mode: TradingMode;
  minEdge: number;
  maxExposure: number;
  marketFilter: string | null;
  liquidityFloor: number;
  pausedMarkets: string[];
  updatedAt: number;
  updatedBy: string;
  /** Monotonic counter incremented on every successful write; enables CAS conflict detection */
  version: number;
}

export interface VibeCommand {
  action: 'set-mode' | 'filter-markets' | 'pause-market' | 'resume-market' | 'set-param';
  payload: Record<string, unknown>;
  source: string;
}

export const VIBE_TOPICS = {
  COMMAND: 'vibe.command',
  STATE_UPDATED: 'vibe.state.updated',
} as const;

export const REDIS_KEY = 'vibe:state';
export const CAS_MAX_RETRIES = 3;

export const MODE_PRESETS: Record<TradingMode, Pick<VibeState, 'minEdge' | 'maxExposure' | 'liquidityFloor'>> = {
  conservative: { minEdge: 3.0, maxExposure: 10, liquidityFloor: 50_000 },
  balanced:     { minEdge: 2.5, maxExposure: 15, liquidityFloor: 10_000 },
  aggressive:   { minEdge: 1.5, maxExposure: 25, liquidityFloor: 5_000  },
  defensive:    { minEdge: 5.0, maxExposure: 5,  liquidityFloor: 100_000 },
};

export const BALANCED_DEFAULTS: VibeState = {
  mode: 'balanced',
  ...MODE_PRESETS.balanced,
  marketFilter: null,
  pausedMarkets: [],
  updatedAt: Date.now(),
  updatedBy: 'system:init',
  version: 0,
};
