/**
 * Live Guard Handoff Coordinator (Facade)
 *
 * Coordinates risk verification when promoted alpha strategies hand off
 * orders to live execution.
 */

export {
  type AlphaLifecycleState,
  type LiveGuardHandoffConfig,
  type LiveOrderHandoffRequest,
  type LiveRiskGateChecks,
  type LiveOrderHandoffVerdict,
  type LiveHandoffStatus,
} from './live-guard-handoff-types';

export { LiveGuardHandoffCoordinator } from './live-guard-handoff-coordinator';
