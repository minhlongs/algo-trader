# POLY-G8.6 Track D — VPS/R2 Infrastructure Economics Decision

**Date:** 2026-11-22  
**Status:** `INFRA_BUDGET = HOLD` | `VPS_R2_ACTIVATION = HOLD`  
**Canonical Cost Model:** `src/desk/polymarket/l2/l2-collector-cost-assumptions.ts` & [`docs/poly-g8/03-VPS-R2-COSTED-DEPLOYMENT-PLAN.md`](../poly-g8/03-VPS-R2-COSTED-DEPLOYMENT-PLAN.md)

---

## D1. Reconciled Cost Assumptions (150 Markets, 30-Day Rolling Retention)

All modeled numbers are explicitly separated from verified public list prices. No unverified assumption is presented as an empirical measurement.

| Component | Verified List Price / Modeled Assumption | Conservative (0.5x / 6x comp) | Base (1.0x / 3.5x comp) | High Load (2.0x / 1x comp) | Status / Provenance |
|---|---|---:|---:|---:|---|
| VPS (`s-2vcpu-4gb`, 2 vCPU, 4 GiB RAM, 80 GiB SSD, 4,000 GiB outbound) | DigitalOcean public list price (`2026-11-19`) | `$24.00` | `$24.00` | `$24.00` | `VERIFIED_PUBLIC_LIST_PRICE` (capacity adequacy `UNVERIFIED`) |
| WAL + Parquet steady 30d storage | Planning assumption `4.39 MB/market-hr` (unverified; PR `#281` 30s drill lacks byte/market inputs) → `474.12 GB` raw WAL + equal Parquet allowance | `79.02 GB` (billed `80 GB-mo`) | `270.926 GB` (billed `271 GB-mo`) | `1,896.48 GB` (billed `1,897 GB-mo`) | `UNVERIFIED` assumption |
| R2 Standard Storage (`$0.015/GB-mo`, ceil, no free tier deducted) | Cloudflare R2 public list price (`2026-11-19`) | `$1.20` | `$4.07` | `$28.46` | `VERIFIED_PUBLIC_LIST_PRICE` |
| R2 Operations (`4,320` Class A @ `$4.50/M` ceil + `8,640` Class B @ `$0.36/M` ceil, no free tier) | `720h × (WAL+Parquet+manifest)` = `2,160` objects/mo; billed per-million ceil | `$4.86` | `$4.86` | `$4.86` | `VERIFIED_PUBLIC_LIST_PRICE` (counts `MODELED`) |
| Monitoring & config backup reserve (no 2nd full dataset copy) | Planning reserve | `$1.00` | `$1.00` | `$2.00` | `MODELED` |
| **Subtotal (Pre-Tax, Pre-License, Pre-FX/Payment Fees)** | | **`$31.06/mo`** | **`$33.93/mo`** | **`$59.32/mo`** | **Exceeds `$30/mo` hard ceiling in all 3 cases** |
| Local 48h spool disk check (80 GiB SSD) | `15.804 GB/day` raw WAL + equal Parquet | `31.6 GB` | `63.22 GB` (tight w/ OS+logs) | `126.4 GB` (**exceeds 80 GiB**) | `UNVERIFIED` capacity risk |
| Taxes, FX/card fees, & Polymarket/ICE Data License | Not included above | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Blocked on Track A + billing country |

**Key Reconciliation Finding:** Even before taxes and data licensing, the `$30/month` ceiling enforced in `l2-collector-cost-assumptions.ts:75` is **not satisfied** (`$31.06` to `$59.32/mo`), and base-case 48h local WAL+Parquet staging (`63.22 GB`) leaves minimal headroom on an `80 GiB` disk.

---

## D2. Economic Options Comparison (Options A–E)

| Option | Annual Fixed Cost (Pre-Tax / Pre-License) | Marginal Cost / Market / Day (Base) | Data-Quality Impact | Compliance Impact | Research Value | Break-Even Requirement |
|---|---|---|---|---|---|---|
| **A. Keep `$30/mo` ceiling & HOLD** | `$0` while held | `$0` | Preserves 150-market IC spec intact | Zero unauthorized spend or collection | Defers Day 0 until Track A & C resolve | `$0` (zero sunk cost while external gates are closed) |
| **B. Request bounded infra budget (`$45/mo` base / `$75/mo` stress cap, excl. license)** | `$407/yr` base (`$712/yr` stress) + tax + license | `~$0.0075` (`$33.93 / (150×30)`) | Full 150-market 30d WAL+Parquet; allows larger disk (`160 GiB`) or compressed-only local spool | Compliant **only** after Track A + C pass | Full IC statistical power (150 markets) | Strategy net alpha must cover `$407–$712/yr` + license + legal; at 10% net annual return, requires `$4.1k–$7.1k` + `10×` license capital |
| **C. Reduce collection scope (e.g., 50 markets or 14d retention)** | `~$355/yr` (`$29.60/mo` still borderline w/ $24 VPS + $4.86 R2 ops) | `~$0.0197` (worse unit economics; VPS fixed) | **Degrades IC methodology** (fewer than 150 markets or <30d violates IC evidence gate) | Still requires Track A + C | Low — risks inconclusive IC study while paying ~87% of base cost | Poor ROI: saves `<$4.50/mo` while breaking IC sample-size target |
| **D. Licensed institutional feed (Polymarket/ICE) instead of self-hosted collector** | `UNKNOWN` (typically `$1,000s–$10,000s/yr` institutional) | Quoted by ICE/Polymarket | Highest (official replay/historical, zero VPS ops) | Cleanest contractual provenance | High if affordable | Requires institutional capital base unless research/evaluation tier is low-cost |
| **E. Suspend strategy if lawful data cost is uneconomic** | `$0` ongoing | `$0` | N/A | Full compliance | Preserves Founder time & capital for Paper SaaS or other venues | Triggered if `Annual License + Infra + Legal > Founder max research budget` |

---

## D3. Single Justified Recommendation

**Recommendation:** **Execute Option A (`HOLD` at `$0/mo` spend) immediately, then branch cleanly to Option B, D, or E once Track A returns written licensing pricing.**

- **Why not Option C?** Because VPS (`$24/mo`) + R2 operation ceilings (`$4.86/mo`) are `$28.86/mo` fixed regardless of market count. Shrinking from 150 to 50 markets saves only `~$2.70/mo` in R2 storage while compromising the IC 150-market statistical design.
- **Why Option A now?** Spending money on a revised budget or VPS provisioning before Polymarket/ICE quotes licensing fees (Track A) and Vietnamese counsel scopes legal boundaries (Track C) risks stranded engineering and infrastructure spend.
- **Decision Rule Once Track A Replies:**
  - If Track A grants a free or low-cost research license → request Founder approval for **Option B** (bounded `$50/mo` base / `$75/mo` hard-stop cap including tax, with compressed local spool verification during 24h qualification).
  - If Track A offers an affordable hosted historical feed → adopt **Option D**.
  - If Track A requires an institutional fee exceeding solo-founder economics → execute **Option E** (suspend Polymarket L2 strategy research cleanly).

`INFRA_BUDGET = HOLD`. The PDF's broader research operating budget is **not** assumed approved.
