/**
 * Platform — RaaS Subscriber Context
 *
 * Multi-tenant SaaS modules. All platform code enforces:
 *   1. Tenant isolation (every DB query scoped to subscriber)
 *   2. Tier gating (features unlocked by license tier)
 *   3. Auth protection (every API route authenticated)
 *
 * Architecture rule: platform/ MUST NOT import from desk/.
 * Platform accesses strategies through the shared IStrategy interface.
 */

// Barrel exports will be populated as modules move from src/ → src/platform/
// See Phase 3 implementation plan for module assignment map.
