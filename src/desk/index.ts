/**
 * Desk — Solo Proprietary Trading Context
 *
 * Operator-only modules. No tenant awareness, no tier gating, no auth.
 * All desk modules operate on the trader's own capital and accounts.
 *
 * Architecture rule: desk/ MUST NOT import from platform/.
 * Communication with platform happens only through shared/ types.
 *
 * Path alias: `@desk/*` → `src/desk/*`
 * Modularized into focused sub-barrels (each strictly < 85 LOC).
 */

export * from './barrels/core-execution-barrel';
export * from './barrels/quant-models-waves-187-231-barrel';
export * from './barrels/quant-models-waves-232-273-barrel';
export * from './barrels/quant-models-waves-274-316-barrel';
