/**
 * Bookkeeping for Primary-Source News-to-Probability Latency.
 *
 * Four facts the strategy must remember across scans, and none of them decide
 * to trade: which ladder legs it owns, which bulletin/event pairs it already
 * acted on, what shadow mode has graded so far, and whether the module has
 * been hard-locked. The lock is one-way — the report requires a single
 * false-news trigger to stop the module, and re-arming it is an operator
 * decision, so there is no unlock path here.
 */

import type { NewsFill, PrimarySourceNewsLatencyConfig } from './primary-source-news-latency-types';

/** What the shadow gate tallies against the report's validation numbers. */
export interface ShadowTally {
  detections: number;
  falsePositives: number;
}

export interface NewsKillRecord {
  reason: 'false-trigger' | 'clock-offset';
  atMs: number;
  detail: string;
}

/** A leg the module owns, with the facts its two-stage exit needs. */
export interface OwnedLeg {
  fill: NewsFill;
  expiryMs: number;
  /** Set once the recycle fraction has been sold inside the band. */
  recycled: boolean;
}

/** A detection awaiting the print that grades it. */
export interface PendingGrade {
  eventId: string;
  bulletinId: string;
  conditionIds: string[];
  detectedAtMs: number;
}

/** Bounded so a long paper session does not grow the dedupe set forever. */
const MAX_SEEN_PAIRS = 5_000;

export class NewsLatencyBook {
  private readonly owned = new Map<string, OwnedLeg>();
  private readonly seen = new Set<string>();
  private readonly pending = new Map<string, PendingGrade>();
  private readonly shadow: ShadowTally = { detections: 0, falsePositives: 0 };
  private kill: NewsKillRecord | null = null;

  isLocked(): boolean {
    return this.kill !== null;
  }

  killRecord(): NewsKillRecord | null {
    return this.kill;
  }

  /** Idempotent: the first reason is the one reported. */
  lock(reason: NewsKillRecord['reason'], atMs: number, detail: string): void {
    if (!this.kill) this.kill = { reason, atMs, detail };
  }

  /** One bulletin acts on one event at most once. */
  markSeen(bulletinId: string, eventId: string): boolean {
    const key = `${bulletinId}|${eventId}`;
    if (this.seen.has(key)) return false;
    if (this.seen.size >= MAX_SEEN_PAIRS) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    this.seen.add(key);
    return true;
  }

  /** Count a detection and keep it until the market's resolution grades it. */
  recordDetection(grade: PendingGrade): void {
    this.shadow.detections += 1;
    this.pending.set(`${grade.bulletinId}|${grade.eventId}`, grade);
  }

  pendingGrades(): PendingGrade[] {
    return [...this.pending.values()];
  }

  settleGrade(grade: PendingGrade): void {
    this.pending.delete(`${grade.bulletinId}|${grade.eventId}`);
  }

  /** A detection the print falsified: tallied, and the module locks. */
  recordFalsePositive(atMs: number, detail: string): void {
    this.shadow.falsePositives += 1;
    this.lock('false-trigger', atMs, detail);
  }

  shadowTally(): Readonly<ShadowTally> {
    return { ...this.shadow };
  }

  /**
   * The report's live gate: enough detections and a false-positive rate at or
   * under the tolerated one. With too few detections the gate is not passed.
   */
  shadowGatePassed(config: PrimarySourceNewsLatencyConfig): boolean {
    if (this.shadow.detections < config.shadowMinDetections) return false;
    if (this.shadow.detections === 0) return true;
    return this.shadow.falsePositives / this.shadow.detections <= config.shadowMaxFalsePositiveRate;
  }

  recordFill(fill: NewsFill, expiryMs: number): void {
    this.owned.set(fill.tokenId, { fill, expiryMs, recycled: false });
  }

  ownedLeg(tokenId: string): OwnedLeg | undefined {
    return this.owned.get(tokenId);
  }

  ownedLegs(): OwnedLeg[] {
    return [...this.owned.values()];
  }

  markRecycled(tokenId: string): void {
    const leg = this.owned.get(tokenId);
    if (leg) leg.recycled = true;
  }

  releaseLeg(tokenId: string): void {
    this.owned.delete(tokenId);
  }
}
