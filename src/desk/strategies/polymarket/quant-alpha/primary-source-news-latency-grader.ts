/**
 * Grades shadow-mode detections against the venue's own resolution.
 *
 * A confirmed bulletin claims the event happened, so every ladder contract it
 * selected must resolve YES. One contract resolving NO falsifies the detection;
 * the report requires that to hard-lock the module. A contract still trading
 * leaves the grade pending — the print has not spoken yet, and an unreadable
 * market is not evidence either way.
 */

import type { GammaClient } from '../../../polymarket/gamma-client';
import type { PendingGrade } from './primary-source-news-latency-state';

export type GradeOutcome = 'confirmed' | 'falsified' | 'pending';

/** A closed market priced at the bounds has resolved; anything else has not. */
const RESOLVED_YES_FLOOR = 0.99;
const RESOLVED_NO_CEILING = 0.01;

export async function gradeDetection(grade: PendingGrade, gamma: GammaClient): Promise<GradeOutcome> {
  let allYes = true;
  for (const conditionId of grade.conditionIds) {
    let market;
    try {
      market = await gamma.getMarket(conditionId);
    } catch {
      return 'pending';
    }
    if (!market || !(market.closed || market.resolved === true)) {
      allYes = false;
      continue;
    }
    if (market.yesPrice <= RESOLVED_NO_CEILING) return 'falsified';
    if (market.yesPrice < RESOLVED_YES_FLOOR) allYes = false;
  }
  return allYes && grade.conditionIds.length > 0 ? 'confirmed' : 'pending';
}
