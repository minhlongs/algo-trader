import type {
  ContractPosition,
  MonteCarloVaRConfig,
  MonteCarloVaRReport,
} from './var-monte-carlo-types';

export class VaRMonteCarloEngine {
  private readonly simulationRuns: number;

  public constructor(config: MonteCarloVaRConfig = {}) {
    this.simulationRuns = config.simulationRuns ?? 10000;
  }

  // Deterministic pseudo-random generator for reproducible simulations
  private createPrng(seed: number): () => number {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return (): number => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  public simulatePortfolio(positions: readonly ContractPosition[], seed: number = 42): MonteCarloVaRReport {
    let portfolioNotional = 0;
    for (const pos of positions) {
      portfolioNotional += pos.quantity * pos.currentPrice;
    }

    if (positions.length === 0 || portfolioNotional <= 0) {
      return {
        portfolioNotionalUsd: 0,
        simulationRuns: this.simulationRuns,
        var95Usd: 0,
        var99Usd: 0,
        cvar95Usd: 0,
        cvar99Usd: 0,
        worstCaseLossUsd: 0,
        probabilityOfTotalLossPct: 0,
      };
    }

    const rand = this.createPrng(seed);
    const pnlOutcomes: number[] = new Array(this.simulationRuns);
    let totalLossCount = 0;

    for (let i = 0; i < this.simulationRuns; i++) {
      let runTerminalValue = 0;

      for (const pos of positions) {
        // Binary contract resolves 1 (YES) or 0 (NO) based on market implied probability
        const resolveYes = rand() < pos.currentPrice;
        const terminalPayout = pos.outcome === 'YES'
          ? (resolveYes ? 1.0 : 0.0)
          : (resolveYes ? 0.0 : 1.0);
        runTerminalValue += pos.quantity * terminalPayout;
      }

      const pnl = runTerminalValue - portfolioNotional;
      pnlOutcomes[i] = pnl;

      if (runTerminalValue <= 1e-4) {
        totalLossCount += 1;
      }
    }

    // Sort losses ascending (most negative PnL first)
    pnlOutcomes.sort((a, b) => a - b);

    // VaR 95% is the loss at 5th percentile
    const idx95 = Math.floor(this.simulationRuns * 0.05);
    const idx99 = Math.floor(this.simulationRuns * 0.01);

    const var95 = Math.max(0, -pnlOutcomes[idx95]!);
    const var99 = Math.max(0, -pnlOutcomes[idx99]!);

    // Expected Shortfall (CVaR): average of losses beyond the VaR cutoff
    let tailSum95 = 0;
    for (let i = 0; i <= idx95; i++) {
      tailSum95 += -pnlOutcomes[i]!;
    }
    const cvar95 = tailSum95 / (idx95 + 1);

    let tailSum99 = 0;
    for (let i = 0; i <= idx99; i++) {
      tailSum99 += -pnlOutcomes[i]!;
    }
    const cvar99 = tailSum99 / (idx99 + 1);

    const worstCaseLoss = Math.max(0, -pnlOutcomes[0]!);
    const probabilityOfTotalLossPct = (totalLossCount / this.simulationRuns) * 100;

    return {
      portfolioNotionalUsd: Math.round(portfolioNotional * 100) / 100,
      simulationRuns: this.simulationRuns,
      var95Usd: Math.round(var95 * 100) / 100,
      var99Usd: Math.round(var99 * 100) / 100,
      cvar95Usd: Math.round(cvar95 * 100) / 100,
      cvar99Usd: Math.round(cvar99 * 100) / 100,
      worstCaseLossUsd: Math.round(worstCaseLoss * 100) / 100,
      probabilityOfTotalLossPct: Math.round(probabilityOfTotalLossPct * 100) / 100,
    };
  }
}
