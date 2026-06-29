/**
 * Desk — Solo Proprietary Trading Context
 *
 * Operator-only modules. No tenant awareness, no tier gating, no auth.
 * All desk modules operate on the trader's own capital and accounts.
 *
 * Architecture rule: desk/ MUST NOT import from platform/.
 * Communication with platform happens only through shared/ types.
 */

// Barrel exports will be populated as modules move from src/ → src/desk/
// See Phase 3 implementation plan for module assignment map.
