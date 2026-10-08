/**
 * Multi-Asset Cross-Margining & Portfolio Capital Optimization Engine
 * Calculates SPAN-style portfolio risk offsets across correlated futures/options classes to reduce gross margin.
 *
 * @module desk/margin/cross-margining-engine
 */

import {
  ContractPosition,
  CrossMarginOffsetMatrix,
  CrossMarginPortfolioResult,
} from './margin-types';

export class CrossMarginingEngine {
  /**
   * Computes portfolio-level diversified initial margin across cross-margined asset classes.
   */
  public evaluateCrossMarginPortfolio(
    positions: ContractPosition[],
    offsetMatrix: CrossMarginOffsetMatrix
  ): CrossMarginPortfolioResult {
    if (positions.length === 0) {
      throw new Error('Positions list cannot be empty');
    }

    let grossStandaloneMarginUsd = 0;
    const classMarginMap = new Map<string, number>();

    for (const pos of positions) {
      if (pos.standaloneMarginRequirementUsd < 0) {
        throw new Error('Standalone margin requirement cannot be negative');
      }
      grossStandaloneMarginUsd += pos.standaloneMarginRequirementUsd;
      const currentClassMargin = classMarginMap.get(pos.assetClass) ?? 0;
      classMarginMap.set(pos.assetClass, currentClassMargin + pos.standaloneMarginRequirementUsd);
    }

    const assetClasses = Array.from(classMarginMap.keys());
    let portfolioVariance = 0;

    for (let i = 0; i < assetClasses.length; i++) {
      for (let j = 0; j < assetClasses.length; j++) {
        const classA = assetClasses[i];
        const classB = assetClasses[j];
        if (!classA || !classB) continue;

        const marginA = classMarginMap.get(classA) ?? 0;
        const marginB = classMarginMap.get(classB) ?? 0;

        let correlation = 0.50; // default moderate correlation
        if (classA === classB) {
          correlation = 1.0;
        } else {
          const key1 = `${classA}:${classB}`;
          const key2 = `${classB}:${classA}`;
          if (offsetMatrix.correlationMatrix[key1] !== undefined) {
            correlation = offsetMatrix.correlationMatrix[key1] ?? 0.50;
          } else if (offsetMatrix.correlationMatrix[key2] !== undefined) {
            correlation = offsetMatrix.correlationMatrix[key2] ?? 0.50;
          }
        }

        portfolioVariance += marginA * marginB * correlation;
      }
    }

    const diversifiedMarginRequirementUsd = Number(
      Math.min(grossStandaloneMarginUsd, Math.sqrt(Math.max(0, portfolioVariance))).toFixed(2)
    );
    const marginSavingsUsd = Number((grossStandaloneMarginUsd - diversifiedMarginRequirementUsd).toFixed(2));
    const capitalEfficiencyRatio = diversifiedMarginRequirementUsd > 0
      ? Number((grossStandaloneMarginUsd / diversifiedMarginRequirementUsd).toFixed(4))
      : 1.0;

    return {
      grossStandaloneMarginUsd: Number(grossStandaloneMarginUsd.toFixed(2)),
      diversifiedMarginRequirementUsd,
      marginSavingsUsd,
      capitalEfficiencyRatio,
    };
  }
}
