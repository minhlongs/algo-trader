/**
 * Kou (2002) Jump-Diffusion Engine
 *
 * Provides analytical option pricing, Greeks, and moment analysis.
 *
 * @module desk/kou/kou-engine
 */

import type { KouConfig, KouOptionResult, KouMoments } from './kou-types';
import { KouMath } from './kou-math';

export class KouEngine {
  private readonly config: KouConfig;

  constructor(config: KouConfig) {
    this.validateConfig(config);
    this.config = { ...config, dividendYield: config.dividendYield ?? 0 };
  }

  private validateConfig(cfg: KouConfig): void {
    if (cfg.spot <= 0) throw new Error(`Spot price must be positive: ${cfg.spot}`);
    if (cfg.strike <= 0) throw new Error(`Strike price must be positive: ${cfg.strike}`);
    if (cfg.maturity < 0) throw new Error(`Maturity cannot be negative: ${cfg.maturity}`);
    if (cfg.volatility <= 0) throw new Error(`Volatility must be positive: ${cfg.volatility}`);
    if (cfg.jumpIntensity < 0) throw new Error(`Jump intensity cannot be negative: ${cfg.jumpIntensity}`);
    if (cfg.pUp < 0 || cfg.pUp > 1) throw new Error(`pUp must be in [0, 1]: ${cfg.pUp}`);
    if (cfg.eta1 <= 1) throw new Error(`eta1 must be strictly greater than 1 (required for E[e^Y] < inf): ${cfg.eta1}`);
    if (cfg.eta2 <= 0) throw new Error(`eta2 must be positive: ${cfg.eta2}`);
  }

  /**
   * Price option and calculate numerical Greeks
   */
  public price(isCall: boolean = true): KouOptionResult {
    const basePrice = KouMath.priceOption(this.config, isCall);
    const { spot, strike, maturity: T } = this.config;

    const dS = Math.max(0.001, spot * 0.005);
    const priceUp = KouMath.priceOption({ ...this.config, spot: spot + dS }, isCall);
    const priceDown = KouMath.priceOption({ ...this.config, spot: spot - dS }, isCall);

    const delta = (priceUp - priceDown) / (2.0 * dS);
    const gamma = (priceUp - 2.0 * basePrice + priceDown) / (dS * dS);

    const dT = Math.min(1.0 / 365.0, T > 0.01 ? 0.005 : T * 0.5);
    let theta = 0;
    if (T > dT) {
      const priceTMinus = KouMath.priceOption({ ...this.config, maturity: T - dT }, isCall);
      theta = (priceTMinus - basePrice) / dT;
    }

    const dr = 0.0001;
    const priceRUp = KouMath.priceOption(
      { ...this.config, riskFreeRate: this.config.riskFreeRate + dr },
      isCall
    );
    const rho = (priceRUp - basePrice) / dr;

    const intrinsic = isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    const timeValue = Math.max(0, basePrice - intrinsic);

    return {
      price: basePrice,
      delta,
      gamma,
      theta,
      rho,
      intrinsicValue: intrinsic,
      timeValue,
    };
  }

  /**
   * Compute log-return moments
   */
  public getMoments(): KouMoments {
    return KouMath.computeMoments(this.config);
  }

  public getConfig(): Readonly<KouConfig> {
    return this.config;
  }
}
