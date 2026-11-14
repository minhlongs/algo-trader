/**
 * Bundle bookkeeping for event-level NegRisk arbitrage.
 *
 * One `BundleRecord` per event tracks filled legs, baseline outcome count, and
 * aggressive failfast rate. Paper conversion releases Q*(1 - vaultFee) pUSD
 * without broadcasting any on-chain transaction.
 */

import type { OpenPosition } from '../base-polymarket-strategy';
import type { BundleLeg, BundleQuote, NegRiskBundleConfig } from './negrisk-bundle-arbitrage-types';
import { failfastErrorRate, shouldKillCluster } from './negrisk-bundle-arbitrage-math';
import { residualPositions } from './negrisk-bundle-position-residuals';

/** One leg confirmed by the venue. */
export interface BundleFill {
  tokenId: string;
  conditionId: string;
  outcome: string;
  price: number;
  quantity: number;
  fees: string | undefined;
  orderId: string;
  atMs: number;
  /** True when the leg matched aggressively (IOC/FOK) rather than resting as maker. */
  aggressive: boolean;
}

export interface BundleRecord {
  eventId: string;
  eventTitle: string;
  /** Outcome count at open time — the baseline the augmented-neg-risk check uses. */
  baselineOutcomeCount: number;
  quote: BundleQuote;
  fills: BundleFill[];
  failfastAttempts: number;
  failfastFailures: number;
  openedAtMs: number;
  /** Set when a leg path was abandoned; the record stops consuming capital. */
  killed: boolean;
  /** Set when the paper conversion has been booked. */
  converted: boolean;
}

export type BundleKillReason =
  | 'augmented-neg-risk'
  | 'failfast-error-rate'
  | 'conversion-unprofitable';

/** How many baskets were attempted and how many closed exhaustive. */
export interface BasketTelemetry {
  attempts: number;
  complete: number;
}

export class BundleBook {
  private readonly records = new Map<string, BundleRecord>();
  private telemetry: BasketTelemetry = { attempts: 0, complete: 0 };

  /** Fills across every live bundle, newest last. */
  get activeRecords(): ReadonlyArray<Readonly<BundleRecord>> {
    return [...this.records.values()];
  }

  open(quote: BundleQuote, nowMs: number): void {
    if (this.records.has(quote.eventId)) return;
    this.telemetry = { ...this.telemetry, attempts: this.telemetry.attempts + 1 };
    this.records.set(quote.eventId, {
      eventId: quote.eventId,
      eventTitle: quote.eventTitle,
      baselineOutcomeCount: quote.legs.length,
      quote,
      fills: [],
      failfastAttempts: 0,
      failfastFailures: 0,
      openedAtMs: nowMs,
      killed: false,
      converted: false,
    });
  }

  isOpen(eventId: string): boolean {
    return this.records.has(eventId);
  }

  /** Register the outcome of one aggressive leg, filled or not. */
  recordAttempt(eventId: string, filled: boolean): void {
    const record = this.records.get(eventId);
    if (!record) return;
    record.failfastAttempts += 1;
    if (!filled) record.failfastFailures += 1;
  }

  recordFill(eventId: string, fill: BundleFill): void {
    this.records.get(eventId)?.fills.push(fill);
  }

  /** The first leg's fill sets the size every later leg is shrunk to. */
  firstFillQuantity(eventId: string): number {
    const record = this.records.get(eventId);
    return record && record.fills.length > 0 ? record.fills[0].quantity : 0;
  }

  /** Legs still missing relative to the quoted event, so the bundle is partial. */
  missingLegs(eventId: string): BundleLeg[] {
    const record = this.records.get(eventId);
    if (!record) return [];
    const filled = new Set(record.fills.map((fill) => fill.tokenId));
    return record.quote.legs.filter((leg) => !filled.has(leg.tokenId));
  }

  /** True once every quoted leg has at least one fill. */
  isComplete(eventId: string): boolean {
    const record = this.records.get(eventId);
    return record !== undefined && this.missingLegs(eventId).length === 0;
  }

  /** Realised quantities are per leg, so a partial bundle exits leg by leg. */
  filledLegs(eventId: string): BundleFill[] {
    return this.records.get(eventId)?.fills.slice() ?? [];
  }

  /**
   * The report's kill conditions for one event cluster.
   *
   * A grown outcome list is fatal because the bundle stops being exhaustive —
   * a new candidate can win while every quoted leg resolves NO. Failfast noise
   * is the weaker signal, so it is only fatal above the configured rate.
   */
  killReason(eventId: string, currentOutcomeCount: number, config: NegRiskBundleConfig): BundleKillReason | null {
    const record = this.records.get(eventId);
    if (!record) return null;
    if (config.killOnAugmentedNegRisk && currentOutcomeCount > record.baselineOutcomeCount) {
      return 'augmented-neg-risk';
    }
    const rate = failfastErrorRate(record.failfastFailures, record.failfastAttempts);
    return shouldKillCluster(rate, config.maxFailfastErrorRate) ? 'failfast-error-rate' : null;
  }

  markKilled(eventId: string): void {
    const record = this.records.get(eventId);
    if (record) record.killed = true;
  }

  isKilled(eventId: string): boolean {
    return this.records.get(eventId)?.killed === true;
  }

  /**
   * Book the conversion once, returning the pUSD released per bundle share.
   *
   * Converting NO on index set I yields |I|·Q collateral and YES outside I,
   * so for a bundle holding YES on every outcome of an exhaustive event the
   * released value is exactly Q·1.00 minus the vault fee. The record is then
   * retired so the event can be re-quoted later without double counting.
   */
  convert(eventId: string, config: NegRiskBundleConfig): number {
    const record = this.records.get(eventId);
    if (!record || record.converted || !(basketsUnder(record) > 0)) return 0;
    record.converted = true;
    this.telemetry = { ...this.telemetry, complete: this.telemetry.complete + 1 };
    return basketsUnder(record) * (1 - config.conversionVaultFeePusd);
  }

  /** Complete basket share count a record supports right now. */
  convertibleQuantity(eventId: string): number {
    const record = this.records.get(eventId);
    return record ? basketsUnder(record) : 0;
  }

  /** Attempted vs. converted basket counts for KPI governance. */
  get basketTelemetry(): Readonly<BasketTelemetry> {
    return this.telemetry;
  }

  /** Drop a finished bundle so its event can be quoted again on a later scan. */
  retire(eventId: string): void {
    this.records.delete(eventId);
  }

  /** Release every record so a long paper session does not grow without bound. */
  clear(): void {
    this.records.clear();
  }

  /** Residuals only: a converted basket leaves nothing for TP/SL to manage. */
  toPositions(eventId: string): OpenPosition[] {
    const record = this.records.get(eventId);
    if (!record) return [];
    return residualPositions(record.fills, record.converted ? basketsUnder(record) : 0);
  }
}

/** Bundle count a set of equal-sized fills supports. */
function basketsUnder(record: BundleRecord): number {
  if (record.fills.length === 0) return 0;
  return Math.min(...record.fills.map((fill) => fill.quantity));
}
