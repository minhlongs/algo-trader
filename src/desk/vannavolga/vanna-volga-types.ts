export interface VannaVolgaMarket {
  spotPrice: number;
  timeToMaturity: number;
  domesticRate: number; // typically 'r'
  foreignRate: number;  // typically 'q' (dividend yield logic)
  
  // Implied volatilities at 3 anchor points
  volAtm: number; // At-the-money
  vol25DeltaCall: number; // 25 Delta Call
  vol25DeltaPut: number;  // 25 Delta Put
  
  // Strike for the 3 anchors
  strikeAtm: number;
  strike25DeltaCall: number;
  strike25DeltaPut: number;
}

export interface VannaVolgaResult {
  interpolatedVol: number;
  targetStrike: number;
  
  // Weights internally used
  weight1: number; // For Put
  weight2: number; // For ATM
  weight3: number; // For Call
}
