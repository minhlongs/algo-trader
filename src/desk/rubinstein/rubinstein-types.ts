export type OptionType = 'call' | 'put';

export interface MarketOptionQuote {
  strike: number;
  marketPrice: number;
  optionType: OptionType;
}

export interface RubinsteinParams {
  spotPrice: number;
  riskFreeRate: number;
  dividendYield: number;
  timeToMaturity: number;
  steps: number;
  marketQuotes: MarketOptionQuote[];
  volatilityPrior: number;
}

export interface TerminalNode {
  index: number;
  spotPrice: number;
  priorProb: number;
  impliedProb: number;
}

export interface OptionFitMetric {
  strike: number;
  optionType: OptionType;
  marketPrice: number;
  modelPrice: number;
  error: number;
}

export interface RubinsteinResult {
  spotPrice: number;
  forwardPrice: number;
  terminalNodes: TerminalNode[];
  fitMetrics: OptionFitMetric[];
  maxAbsFittingError: number;
  martingaleError: number;
  entropyDivergence: number;
}
