#!/usr/bin/env ts-node
/**
 * Trial Drip Runner — PM2 cron entry point
 *
 * PM2 cron_restart: 0 * * * * (hourly)
 * Calls TrialDripService.processDueEmails() which terminates immediately
 * when there are zero active subscribers.
 */

import { TrialDripService } from '../billing/trial-drip-service';

async function main(): Promise<void> {
  const svc = TrialDripService.getInstance();
  try {
    const result = await svc.processDueEmails();
    if (result.sent > 0 || result.errors > 0) {
      // eslint-disable-next-line no-console
      console.log(`[trial-drip-runner] sent=${result.sent} skipped=${result.skipped} errors=${result.errors}`);
    }
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[trial-drip-runner] Failed', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
