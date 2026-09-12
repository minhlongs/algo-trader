/**
 * Jupiter Price Adapter Singleton Instance Registry
 */
import { type JupiterPriceConfig } from './jupiter-price-types';
import { JupiterPriceAdapter } from './jupiter-price-adapter';

let sharedInstance: JupiterPriceAdapter | null = null;

export function getJupiterAdapter(config?: JupiterPriceConfig): JupiterPriceAdapter {
  if (!sharedInstance) {
    sharedInstance = new JupiterPriceAdapter(config);
  }
  return sharedInstance;
}

export function resetJupiterAdapter(): void {
  sharedInstance = null;
}
