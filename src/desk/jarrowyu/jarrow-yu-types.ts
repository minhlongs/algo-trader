export interface JarrowYuParams {
  autonomousHazardA: number;   // a_0: Autonomous default intensity of Primary firm A (> 0)
  baselineHazardB: number;     // b_0: Baseline default intensity of Secondary firm B (> 0)
  contagionJumpA1: number;     // a_1: Hazard jump of firm B if firm A defaults (>= 0)
  recoveryRateB?: number;      // R_B: Recovery rate of firm B in [0, 1) (default 0.40)
  riskFreeRate?: number;       // r: Risk-free interest rate (default 0.03)
  maturity: number;            // T: Time to maturity in years (> 0)
}

export interface SurvivalProbabilities {
  survivalA: number;           // P(tau_A > T)
  survivalB: number;           // P(tau_B > T) unconditional
  jointSurvival: number;       // P(tau_A > T, tau_B > T)
  conditionalSurvivalB: number;// P(tau_B > T | tau_A <= T)
  contagionSpreadImpact: number; // Difference between post-contagion and baseline spread
}

export interface JarrowYuResult {
  params: JarrowYuParams;
  survival: SurvivalProbabilities;
  baselineCdsSpreadB: number;  // CDS spread of B if no contagion (a_1 = 0)
  vulnerableCdsSpreadB: number;// Full unconditional CDS spread of B with contagion
  contagionRiskPremiumB: number;// vulnerableCdsSpreadB - baselineCdsSpreadB
  protectionLegPv: number;     // Present value of default protection leg
  annuityLegPv: number;        // Present value of premium/risky annuity leg
}
