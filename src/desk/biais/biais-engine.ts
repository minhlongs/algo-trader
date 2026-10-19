/**
 * Biais, Hillion, Spatt (1995) LOB Order Flow Engine.
 * End-to-end Markov transition matrix, diagonal clustering, and spread dynamics.
 * Strictly < 180 LOC, zero :any types.
 */

import {
  ALL_LOB_EVENT_TYPES,
  BiaisAnalysisResult,
  LobEvent,
  LobEventType,
} from './biais-types';
import {
  buildEventFrequencies,
  buildTransitionMatrix,
  evaluateDiagonalClustering,
} from './biais-transitions';
import {
  analyzeSpreadDynamics,
  computeOrderFlowMomentum,
} from './biais-spread-dynamics';

export class BiaisOrderFlowEngine {
  public analyze(events: readonly LobEvent[]): BiaisAnalysisResult {
    if (events.length === 0) {
      throw new Error('Cannot analyze empty LOB event sequence');
    }

    const eventFrequencies = buildEventFrequencies(events);
    const { matrix } = buildTransitionMatrix(events);
    const diagonalClustering = evaluateDiagonalClustering(
      matrix,
      eventFrequencies,
      events.length
    );
    const spreadDynamics = analyzeSpreadDynamics(events);
    const orderFlowMomentum = computeOrderFlowMomentum(matrix);

    return {
      totalEvents: events.length,
      eventFrequencies,
      transitionMatrix: matrix,
      diagonalClustering,
      spreadDynamics,
      orderFlowMomentum,
    };
  }

  public predictNextTransition(
    currentEvent: LobEventType,
    analysis: BiaisAnalysisResult
  ): {
    topTransitions: readonly { target: LobEventType; probability: number }[];
    isDiagonalClustered: boolean;
  } {
    const row = analysis.transitionMatrix[currentEvent];
    const targets = ALL_LOB_EVENT_TYPES.map((type) => ({
      target: type,
      probability: row[type],
    })).sort((a, b) => b.probability - a.probability);

    const selfProb = row[currentEvent];
    const clustering = analysis.diagonalClustering.find(
      (c) => c.eventType === currentEvent
    );
    const isDiagonalClustered = (clustering?.clusteringLift ?? 1.0) > 1.0;

    return {
      topTransitions: targets,
      isDiagonalClustered,
    };
  }
}
