---
name: s18-oversized-debt-tranche5-shipped
description: S18 Oversized-Debt Tranche 5 shipped with ratchet prune 242->237 and version 3.1.37
metadata:
  type: project
---

S18 Oversized-File Debt Burn-Down Tranche 5 was successfully completed and validated. 5 non-test violators (`email-service.ts`, `research-mcp-server.ts`, `signal-subscription-routes.ts`, `price-impact-estimator.ts`, `regime-adaptive-momentum-v2.ts`) were split into ≤200-LOC modules behind identical facades.

**Why:** Continuous technical debt payment; driving all oversized files down without disrupting test or importer behavior.
**How to apply:** Treat these 5 files as newly refactored domains. No new any types (ceiling 114) and no new console.logs (ceiling 45) were added. The quality ratchet for oversized files now sits at 237.