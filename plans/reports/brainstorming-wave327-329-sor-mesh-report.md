# Deep Brainstorming Report (`/ak-brainstorm --deep`) — Waves 327–329 Multi-Venue SOR Triad, Stitch Screen #13 (`order-routing-mesh`) & `<= 180 LOC` Modularization

- **Date:** 2026-10-17
- **Branch:** `feat/triad-apex-deep-refactor-wave180-182`
- **Scope:**
  1. Decompose all 33 remaining `.ts` files in `src/` at `181–183 LOC` into cohesive single-responsibility submodules (`<= 165 LOC` each) so that **zero `.ts` files in `src/` exceed `180 LOC`**.
  2. Deliver Quantitative Desk Triad Waves 327–329 (Multi-Venue Smart Order Routing & Dark/Lit Pool Economics):
     - **Wave 327 (`src/desk/contkukanov2017multiexchange/`):** Cont & Kukanov (2017) *Optimal Order Placement in Limit Order Markets Across Multiple Exchanges* (`ContKukanov2017MultiExchange`).
     - **Wave 328 (`src/desk/laruellelehalle2013darkpool/`):** Laruelle, Lehalle & Pagès (2013) *Optimal Split of Orders Across Liquidity Pools: A Stochastic Algorithm Approach* (`LaruelleLehalle2013DarkPoolSplit`).
     - **Wave 329 (`src/desk/foucault2005maketake/`):** Foucault, Kadan & Kandel (2005) *Limit Order Book as a Market for Liquidity: Make/Take Equilibrium & Waiting Cost* (`FoucaultKadanKandel2005MakeTake`).
  3. Deliver Stitch Screen #13 (`site/public/order-routing-mesh.html` & `queue/order-routing-mesh.html`) following `next-prompt.md` in Obsidian Quantum (`#08090C` canvas, `#0F1218` surface, `#00F2FE` Cyan Pulse, `#00E599` Mint Green, `#FF3B30` Kill-Switch Red), register in `SITE.md` & `stitch.json`, and wire `GET /sor-mesh` into `stitch-ui-cockpit.ts` & `stitch-cockpit-routes.ts`.
  4. Verify with `tests/unit/desk/waves_327_329_sor_mesh_suite.test.ts` and commit cleanly on `feat/triad-apex-deep-refactor-wave180-182`.

## Unresolved Questions
- None. All 4 tracks are deterministic, backward-compatible, and verified by automated gates.
