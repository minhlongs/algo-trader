/**
 * Leg-2 Execution Decay Tracker (G2-Poly-Shadow)
 *
 * An arbitrage leg pair is only as good as its second leg. The first leg fills,
 * and the second leg — placed against a book that moved while we were placing
 * it — may fill partially or not at all. This tracker measures that decay so the
 * KPI layer can report realised basket completion instead of assumed completion.
 *
 * A second leg is recognised by timing and token, not by an explicit pairing
 * call: a BUY on a different token within two seconds of a filled BUY is the
 * second leg of that pair.
 */

export interface Leg2DecayStats {
  leg1Fills: number;
  leg2Attempts: number;
  leg2FullFills: number;
  leg2PartialFills: number;
  leg2Rejects: number;
  /** Share of second-leg attempts that did not fill in full (0 = perfect). */
  leg2FillDecayRatio: number;
}

/** Maximum gap between leg 1 and leg 2 for the two to count as one basket. */
export const LEG_PAIRING_WINDOW_MS = 2000;

/** The subset of a fill outcome this tracker needs; keeps the module dependency-free. */
export interface LegOutcomeSummary {
  lifecycleType: 'FILLED' | 'PARTIALLY_FILLED' | 'REJECTED';
  filledSize: number;
}

export class PaperLegDecayTracker {
  private lastLeg1AtMs = 0;
  private lastLeg1TokenId = '';
  private leg1Fills = 0;
  private leg2Attempts = 0;
  private leg2FullFills = 0;
  private leg2PartialFills = 0;
  private leg2Rejects = 0;

  recordOrderOutcome(
    tokenId: string,
    side: 'BUY' | 'SELL',
    outcome: LegOutcomeSummary,
    nowMs = Date.now(),
  ): void {
    if (side !== 'BUY') return;
    const isPairedSecondLeg =
      this.lastLeg1AtMs > 0 &&
      nowMs - this.lastLeg1AtMs <= LEG_PAIRING_WINDOW_MS &&
      this.lastLeg1TokenId !== '' &&
      this.lastLeg1TokenId !== tokenId;

    if (isPairedSecondLeg) {
      this.leg2Attempts++;
      if (outcome.lifecycleType === 'FILLED') this.leg2FullFills++;
      else if (outcome.lifecycleType === 'PARTIALLY_FILLED') this.leg2PartialFills++;
      else this.leg2Rejects++;
      this.lastLeg1AtMs = 0;
      this.lastLeg1TokenId = '';
      return;
    }

    if (outcome.filledSize > 0) {
      this.leg1Fills++;
      this.lastLeg1AtMs = nowMs;
      this.lastLeg1TokenId = tokenId;
    }
  }

  getStats(): Leg2DecayStats {
    const failedOrPartial = this.leg2PartialFills + this.leg2Rejects;
    const leg2FillDecayRatio = this.leg2Attempts > 0 ? failedOrPartial / this.leg2Attempts : 0;
    return {
      leg1Fills: this.leg1Fills,
      leg2Attempts: this.leg2Attempts,
      leg2FullFills: this.leg2FullFills,
      leg2PartialFills: this.leg2PartialFills,
      leg2Rejects: this.leg2Rejects,
      leg2FillDecayRatio,
    };
  }
}
