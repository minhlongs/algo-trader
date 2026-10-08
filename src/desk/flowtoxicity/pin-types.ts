export interface PinDailyTradeData {
  readonly buys: number;
  readonly sells: number;
}

export interface PinParameters {
  readonly alpha: number; // Probability of an information event in [0, 1]
  readonly delta: number; // Probability of bad news conditional on an event in [0, 1]
  readonly mu: number; // Informed trading arrival rate > 0
  readonly epsilonBuy: number; // Uninformed buy arrival rate > 0
  readonly epsilonSell: number; // Uninformed sell arrival rate > 0
}

export interface PinEstimationResult {
  readonly parameters: PinParameters;
  readonly pin: number; // Probability of Informed Trading in [0, 1]
  readonly logLikelihood: number;
  readonly iterations: number;
  readonly converged: boolean;
}

export interface PinRegimeProbabilities {
  readonly probNoEvent: number;
  readonly probBadNews: number;
  readonly probGoodNews: number;
}
