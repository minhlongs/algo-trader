import type {
  MarketPositionEntry,
  PortfolioStressAssessment,
  ResolutionStressScenario,
  ScenarioImpactResult,
} from './correlated-resolution-types';

export class CorrelatedResolutionStressTester {
  private readonly availableCapitalBufferUsd: number;

  public constructor(availableCapitalBufferUsd: number = 50000) {
    this.availableCapitalBufferUsd = availableCapitalBufferUsd;
  }

  public evaluateScenario(
    positions: readonly MarketPositionEntry[],
    scenario: ResolutionStressScenario
  ): ScenarioImpactResult {
    let preStressNotional = 0;
    let postStressTerminalValue = 0;
    let unaffectedCount = 0;

    for (const pos of positions) {
      preStressNotional += pos.quantity * pos.markPrice;
      const forcedOutcome = scenario.forcedResolutions[pos.marketId];

      if (forcedOutcome !== undefined) {
        // Market resolved
        const payoutPerUnit = pos.outcome === forcedOutcome ? 1.0 : 0.0;
        postStressTerminalValue += pos.quantity * payoutPerUnit;
      } else {
        // Market unaffected, retains current mark price
        unaffectedCount += 1;
        postStressTerminalValue += pos.quantity * pos.markPrice;
      }
    }

    const netStressLoss = Math.max(0, preStressNotional - postStressTerminalValue);
    const lossPercentage = preStressNotional > 0 ? (netStressLoss / preStressNotional) * 100 : 0;
    const isBufferBreached = netStressLoss > this.availableCapitalBufferUsd;

    return {
      scenarioName: scenario.scenarioName,
      preStressNotionalUsd: Math.round(preStressNotional * 100) / 100,
      postStressTerminalValueUsd: Math.round(postStressTerminalValue * 100) / 100,
      netStressLossUsd: Math.round(netStressLoss * 100) / 100,
      lossPercentagePct: Math.round(lossPercentage * 100) / 100,
      isCapitalBufferBreached: isBufferBreached,
      unaffectedMarketsCount: unaffectedCount,
    };
  }

  public runStressTestSuite(
    positions: readonly MarketPositionEntry[],
    scenarios: readonly ResolutionStressScenario[]
  ): PortfolioStressAssessment {
    const results: ScenarioImpactResult[] = [];
    let worstLoss = 0;
    let worstScenario = 'NONE';

    for (const sc of scenarios) {
      const impact = this.evaluateScenario(positions, sc);
      results.push(impact);
      if (impact.netStressLossUsd > worstLoss) {
        worstLoss = impact.netStressLossUsd;
        worstScenario = impact.scenarioName;
      }
    }

    return {
      availableCapitalBufferUsd: this.availableCapitalBufferUsd,
      worstScenarioName: worstScenario,
      maxDrawdownUsd: Math.round(worstLoss * 100) / 100,
      scenarioResults: results,
    };
  }
}
