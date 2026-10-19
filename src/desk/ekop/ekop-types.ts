export interface EkopParameters {
  alpha: number; // Probability of information event [0, 1]
  delta: number; // Probability of bad news given event [0, 1]
  mu: number;    // Informed trader arrival rate (> 0)
  epsilon: number; // Uninformed trader arrival rate (> 0)
}

export interface DailyTradeCount {
  buys: number;
  sells: number;
}

export interface DayPosteriorProbabilities {
  probNoEvent: number;
  probGoodNews: number;
  probBadNews: number;
  classifiedState: 'NO_EVENT' | 'GOOD_NEWS' | 'BAD_NEWS';
}

export interface EkopAnalysisResult {
  pin: number;
  parameters: EkopParameters;
  logLikelihood: number;
  adverseSelectionSpread: number;
  posteriors: DayPosteriorProbabilities[];
  expectedDailyVolume: number;
  expectedInformedRatio: number;
}
