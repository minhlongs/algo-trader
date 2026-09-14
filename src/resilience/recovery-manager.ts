/**
 * State persistence & crash recovery - facade.
 * Re-exports types, paths, io, and RecoveryManager service.
 */

import { RecoveryManager } from './recovery-manager-service';

export * from './recovery-manager-types';
export * from './recovery-manager-paths';
export * from './recovery-manager-io';
export * from './recovery-manager-service';

/** Default singleton instance */
export const recoveryManager = new RecoveryManager();
