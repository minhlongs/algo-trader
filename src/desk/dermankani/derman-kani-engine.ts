/**
 * Derman-Kani (1994) Implied Volatility Local Tree Engine
 *
 * Master coordinator for calibration of implied tree to volatility smile surfaces
 * and pricing exotic/American contracts with smile adjustment.
 *
 * @module desk/dermankani/derman-kani-engine
 */

import type {
  DermanKaniConfig,
  DermanKaniTree,
  TreeOptionPricingInput,
  TreeOptionPricingResult,
} from './derman-kani-types';
import { buildDermanKaniTree } from './derman-kani-calibrator';
import { priceOptionOnTree } from './derman-kani-pricer';

export class DermanKaniEngine {
  private tree?: DermanKaniTree;

  constructor(private readonly config: DermanKaniConfig) {}

  /** Calibrate the local volatility tree to the market implied vol surface */
  calibrate(): DermanKaniTree {
    this.tree = buildDermanKaniTree(this.config);
    return this.tree;
  }

  /** Get calibrated tree, calibrating if not yet built */
  getTree(): DermanKaniTree {
    if (!this.tree) {
      this.tree = this.calibrate();
    }
    return this.tree;
  }

  /** Price option via backward induction on calibrated tree */
  price(input: TreeOptionPricingInput): TreeOptionPricingResult {
    const tree = this.getTree();
    return priceOptionOnTree(tree, input);
  }

  /** Extract local volatility profile at a specific maturity step */
  getLocalVolProfile(stepIndex: number): { strike: number; localVol: number }[] {
    const tree = this.getTree();
    if (stepIndex < 0 || stepIndex >= tree.nodes.length) {
      throw new Error(`Step index ${stepIndex} out of range [0, ${tree.nodes.length - 1}]`);
    }
    return tree.nodes[stepIndex].map((node) => ({
      strike: node.stockPrice,
      localVol: node.localVol ?? 0.2,
    }));
  }
}
