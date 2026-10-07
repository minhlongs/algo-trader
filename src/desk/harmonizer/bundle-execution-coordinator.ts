/**
 * Bundle Execution Coordinator
 * Dispatches multi-leg bundle executions via CombinatorialBundleRouter.
 *
 * @module desk/harmonizer/bundle-execution-coordinator
 */

import { CombinatorialBundleRouter } from '../sor/combinatorial-bundle-router';
import type {
  AvailableLegDepth,
  BundleFillResult,
  BundleLegSpec,
} from '../sor/combinatorial-bundle-types';

export class BundleExecutionCoordinator {
  private readonly router: CombinatorialBundleRouter;

  public constructor(maxSkewTolerance: number = 0.05) {
    this.router = new CombinatorialBundleRouter(maxSkewTolerance);
  }

  public coordinateExecution(
    bundleId: string,
    legs: readonly BundleLegSpec[],
    depths: readonly AvailableLegDepth[]
  ): BundleFillResult {
    return this.router.routeBundle(bundleId, legs, depths);
  }
}
