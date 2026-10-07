/**
 * Almgren-Chriss (2000) Optimal Execution Market Impact & Slippage Model
 *
 * Models permanent price impact (linear) and temporary price impact (square root / power law):
 *   I_perm = gamma * sigma * (v / V)^alpha
 *   I_temp = eta * sigma * (v / V)^beta
 * Total slippage per share = I_perm + I_temp
 *
 * @module alpha-lab/backtest/slippage-model
 */

export interface AlmgrenChrissParams {
  permanentImpact?: number;
  temporaryImpact?: number;
  volatility?: number;
  powerPermanent?: number;
  powerTemporary?: number;
}

export interface SlippageBreakdown {
  participationRate: number;
  permanentSlippage: number;
  temporarySlippage: number;
  totalSlippage: number;
}

export class AlmgrenChrissModel {
  private readonly gamma: number;
  private readonly eta: number;
  private readonly baseVolatility: number;
  private readonly alpha: number;
  private readonly beta: number;

  constructor(params?: AlmgrenChrissParams | number, temporaryImpact: number = 0.5) {
    if (typeof params === 'number') {
      this.gamma = params;
      this.eta = temporaryImpact;
      this.baseVolatility = 1.0;
      this.alpha = 1.0;
      this.beta = 0.5;
    } else {
      this.gamma = params?.permanentImpact ?? 0.1;
      this.eta = params?.temporaryImpact ?? 0.5;
      this.baseVolatility = params?.volatility ?? 1.0;
      this.alpha = params?.powerPermanent ?? 1.0;
      this.beta = params?.powerTemporary ?? 0.5;
    }
  }

  public getPermanentImpact(): number {
    return this.gamma;
  }

  public getTemporaryImpact(): number {
    return this.eta;
  }

  public calculateSlippage(orderVolume: number, dailyVolume: number, volatility?: number): number {
    if (dailyVolume <= 0 || orderVolume <= 0) return 0;
    const rate = Math.max(0, orderVolume / dailyVolume);
    const vol = volatility !== undefined && volatility > 0 ? volatility : this.baseVolatility;
    const perm = this.gamma * vol * Math.pow(rate, this.alpha);
    const temp = this.eta * vol * Math.pow(rate, this.beta);
    return perm + temp;
  }

  public calculateBreakdown(orderVolume: number, dailyVolume: number, volatility?: number): SlippageBreakdown {
    if (dailyVolume <= 0 || orderVolume <= 0) {
      return { participationRate: 0, permanentSlippage: 0, temporarySlippage: 0, totalSlippage: 0 };
    }
    const participationRate = Math.max(0, orderVolume / dailyVolume);
    const vol = volatility !== undefined && volatility > 0 ? volatility : this.baseVolatility;
    const permanentSlippage = this.gamma * vol * Math.pow(participationRate, this.alpha);
    const temporarySlippage = this.eta * vol * Math.pow(participationRate, this.beta);
    return {
      participationRate,
      permanentSlippage,
      temporarySlippage,
      totalSlippage: permanentSlippage + temporarySlippage,
    };
  }
}
