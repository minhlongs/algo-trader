/**
 * Paper Trading Capital Reservation Helper
 * Manages atomic synchronous capital reservations across concurrent paper trading signals.
 * Prevents race condition overdrafts and max position over-allocation.
 */

export interface CapitalReservation {
  id: string;
  size: number;
  release: () => void;
  commit: () => void;
}

let activeReservedCapital = 0;
let activeReservedPositions = 0;

/**
 * Returns current total reserved capital amount.
 */
export function getReservedCapital(): number {
  return activeReservedCapital;
}

/**
 * Returns current count of pending reserved positions.
 */
export function getReservedPositionsCount(): number {
  return activeReservedPositions;
}

/**
 * Reset all active reservations (for test isolation).
 */
export function resetCapitalReservations(): void {
  activeReservedCapital = 0;
  activeReservedPositions = 0;
}

export interface ReservationParams {
  currentCapital: number;
  currentPositionsCount: number;
  maxPositions: number;
  maxExposure: number;
  positionSizePct: number;
}

/**
 * Atomically evaluate and reserve paper trading capital if limits permit.
 * Synchronously reserves capital and slot count; returns reservation handle or null if rejected.
 */
export function tryReservePaperCapital(params: ReservationParams): CapitalReservation | null {
  const {
    currentCapital,
    currentPositionsCount,
    maxPositions,
    maxExposure,
    positionSizePct,
  } = params;

  const totalPositions = currentPositionsCount + activeReservedPositions;
  if (totalPositions >= maxPositions) {
    return null;
  }

  const unreservedCapital = currentCapital - activeReservedCapital;
  if (unreservedCapital <= 0) {
    return null;
  }

  const calculatedSize = Math.min(unreservedCapital * positionSizePct, maxExposure);
  if (calculatedSize <= 0 || calculatedSize > unreservedCapital) {
    return null;
  }

  activeReservedCapital += calculatedSize;
  activeReservedPositions += 1;

  let resolved = false;
  const id = `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    size: calculatedSize,
    release: () => {
      if (!resolved) {
        resolved = true;
        activeReservedCapital = Math.max(0, activeReservedCapital - calculatedSize);
        activeReservedPositions = Math.max(0, activeReservedPositions - 1);
      }
    },
    commit: () => {
      if (!resolved) {
        resolved = true;
        activeReservedCapital = Math.max(0, activeReservedCapital - calculatedSize);
        activeReservedPositions = Math.max(0, activeReservedPositions - 1);
      }
    },
  };
}
