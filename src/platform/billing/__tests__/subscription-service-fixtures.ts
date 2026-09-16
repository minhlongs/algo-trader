/**
 * Test fixtures and utilities for SubscriptionService tests
 */

import { SubscriptionService } from '../subscription-service';
import { LicenseService } from '../license-service';

export function resetSubscriptionServices() {
  const service = SubscriptionService.getInstance();
  const licenseService = LicenseService.getInstance();
  (service as any).subscriptions.clear();
  (licenseService as any).licenses.clear();
  return { service, licenseService };
}
