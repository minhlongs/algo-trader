// SPDX-License-Identifier: MIT
/**
 * Step 12: MCU & Strategy Quota Metering Facade
 * Re-exports real-time API & strategy computation unit (MCU) billing meter
 * with HTTP 402 Payment Required enforcement.
 *
 * @module billing/billing-meter
 */

export {
  BillingMeter,
  TIER_QUOTAS,
  type QuotaAllocation,
  type QuotaCheckResult,
} from '../desk/opencoresaas2026monetization/billing-meter';
