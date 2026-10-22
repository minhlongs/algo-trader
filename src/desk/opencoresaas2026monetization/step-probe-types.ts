// SPDX-License-Identifier: MIT
/**
 * Shared shape for 25-step behavioral probes.
 *
 * Kept separate from the probe implementations so a consumer can type a probe result without
 * importing the runtime code the probes exercise.
 *
 * @module desk/opencoresaas2026monetization/step-probe-types
 */

/** Outcome of probing one step. `evidence` is shown in the audit so a reviewer can see why. */
export interface StepProbeResult {
  readonly verified: boolean;
  readonly evidence: string;
  /**
   * `behavioral` means the probe exercised real behavior. `absent` means the step has no honest
   * probe yet, so it can only be counted as existence-verified — never as DONE.
   */
  readonly kind: 'behavioral' | 'absent';
}
