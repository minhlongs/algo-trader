import { RegionId, VectorClock } from './edge-raft-lite-types';

export const ALL_REGIONS: readonly RegionId[] = ['nrt', 'sin', 'fra'] as const;

export function createInitialClock(): VectorClock {
  return { nrt: 0, sin: 0, fra: 0 };
}

export function mergeClocks(a: VectorClock, b: VectorClock): VectorClock {
  return {
    nrt: Math.max(a.nrt, b.nrt),
    sin: Math.max(a.sin, b.sin),
    fra: Math.max(a.fra, b.fra),
  };
}
