import { HestonParams, HestonOptionParams, ComplexNumber } from './heston-types';
import { HestonMath as HM } from './heston-math';

export class HestonEngine {
  /**
   * Prices European options using the Heston (1993) Stochastic Volatility Model.
   * Utilizes the stabilized Albrecher formulation of the Characteristic Function 
   * and Gaussian Quadrature / Simpson integration.
   */
  public static calculateEuropeanOption(model: HestonParams, option: HestonOptionParams): number {
    // Gauss-Laguerre quadrature points and weights (n=15 is sufficient for smooth Heston CF)
    const glX = [
      0.093307812017, 0.492691740301, 1.215595412071, 2.269949526203, 3.667622721751, 
      5.425336627413, 7.565916226613, 10.120228568019, 13.130282482175, 16.654407708329, 
      20.776478899448, 25.623894226728, 31.407519169753, 38.530683306486, 48.026085572685
    ];
    const glW = [
      0.218234817967, 0.342210177922, 0.263027577941, 0.126425818105, 0.040206864921,
      0.008563877803, 0.001212436147, 0.000111674392, 0.000006459926, 0.000000222631,
      0.000000004312, 0.000000000042, 0.000000000000, 0.000000000000, 0.000000000000
    ];

    let integral1 = 0.0;
    let integral2 = 0.0;

    for (let i = 0; i < glX.length; i++) {
        const phi = glX[i];
        const weight = glW[i] * Math.exp(phi); // Gauss-Laguerre weight adjustment (w_i * e^{x_i})

        // We integrate without the e^{-x} component because Gauss-Laguerre provides it
        // Wait, standard Gauss-Laguerre evaluates Int e^-x f(x) dx ~= Sum w_i f(x_i)
        // If we want Int F(x) dx, we do Int e^-x (e^x F(x)) dx ~= Sum w_i e^{x_i} F(x_i)
        
        const f2 = this.characteristicFunction(model, option.timeToMaturity, { re: phi, im: 0 });
        const f1 = this.characteristicFunction(model, option.timeToMaturity, { re: phi, im: -1.0 });

        // Characteristic of log S at t=0
        const f_minus_i = Math.exp(Math.log(model.S0) + (model.r - model.q) * option.timeToMaturity);

        const exp_m_i_phi_lnK = HM.exp({ re: 0, im: -phi * Math.log(option.strike) });

        // For P2: Re[ e^{-i phi ln K} * f(phi) / (i phi) ]
        const num2 = HM.mul(exp_m_i_phi_lnK, f2);
        const integrand2 = HM.div(num2, { re: 0, im: phi });
        integral2 += weight * integrand2.re;

        // For P1: Re[ e^{-i phi ln K} * f(phi - i) / (i phi * f(-i)) ]
        const num1 = HM.mul(exp_m_i_phi_lnK, f1);
        const denom1 = { re: 0, im: phi * f_minus_i };
        const integrand1 = HM.div(num1, denom1);
        integral1 += weight * integrand1.re;
    }

    const p1 = 0.5 + (1.0 / Math.PI) * integral1;
    const p2 = 0.5 + (1.0 / Math.PI) * integral2;

    const S = model.S0;
    const K = option.strike;
    const T = option.timeToMaturity;
    const r = model.r;
    const q = model.q;

    // Call Price
    const callPrice = S * Math.exp(-q * T) * p1 - K * Math.exp(-r * T) * p2;

    if (option.isCall) {
      return Math.max(0.0, callPrice);
    } else {
      // Put-Call Parity
      const putPrice = callPrice + K * Math.exp(-r * T) - S * Math.exp(-q * T);
      return Math.max(0.0, putPrice);
    }
  }

  private static characteristicFunction(model: HestonParams, tau: number, phiC: ComplexNumber): ComplexNumber {
    const kappa = model.kappa;
    const theta = model.theta;
    const sigma = model.sigma;
    const rho = model.rho;
    const v0 = model.v0;
    const S0 = model.S0;
    const rq = model.r - model.q;

    // phi = phiC
    const i = { re: 0, im: 1 };
    
    // a1 = kappa - i * rho * sigma * phi
    const i_rho_sigma = HM.mulScalar(i, rho * sigma);
    const term_irs_phi = HM.mul(i_rho_sigma, phiC);
    const a1 = HM.sub({ re: kappa, im: 0 }, term_irs_phi); // kappa - i*rho*sigma*phi

    // b1 = phi^2 + i * phi
    const phi_sq = HM.mul(phiC, phiC);
    const i_phi = HM.mul(i, phiC);
    const b1 = HM.add(phi_sq, i_phi);

    // d = sqrt(a1^2 + sigma^2 * b1)
    const a1_sq = HM.mul(a1, a1);
    const sig_sq_b1 = HM.mulScalar(b1, sigma * sigma);
    const d = HM.sqrt(HM.add(a1_sq, sig_sq_b1));

    // g = (a1 - d) / (a1 + d)
    const a1_m_d = HM.sub(a1, d);
    const a1_p_d = HM.add(a1, d);
    const g = HM.div(a1_m_d, a1_p_d);

    // exp_m_d_tau = exp(-d * tau)
    const m_d_tau = HM.mulScalar(d, -tau);
    const exp_m_d_tau = HM.exp(m_d_tau);

    // D = (a1 - d) / sigma^2 * (1 - exp_m_d_tau) / (1 - g * exp_m_d_tau)
    const one = { re: 1, im: 0 };
    const num_D = HM.sub(one, exp_m_d_tau);
    const den_D = HM.sub(one, HM.mul(g, exp_m_d_tau));
    const term_D1 = HM.mulScalar(a1_m_d, 1.0 / (sigma * sigma));
    const D = HM.mul(term_D1, HM.div(num_D, den_D));

    // C = (kappa * theta / sigma^2) * [ (a1 - d)*tau - 2 * log( (1 - g * exp_m_d_tau) / (1 - g) ) ]
    const term_C1 = (kappa * theta) / (sigma * sigma);
    const inside_C2 = HM.div(den_D, HM.sub(one, g));
    const C2 = HM.mulScalar(HM.log(inside_C2), -2.0);
    const C1 = HM.mulScalar(a1_m_d, tau);
    const C_inner = HM.add(C1, C2);
    const C = HM.mulScalar(C_inner, term_C1);

    // i * phi * (ln(S0) + (r - q)*tau)
    const fwd_log = Math.log(S0) + rq * tau;
    const drift = HM.mulScalar(i_phi, fwd_log);

    // exp(C + D*v0 + drift)
    const exponent = HM.add(C, HM.add(HM.mulScalar(D, v0), drift));
    
    return HM.exp(exponent);
  }
}
