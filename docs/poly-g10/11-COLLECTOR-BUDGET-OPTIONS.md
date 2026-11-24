# POLY-G10.3 — Collector Unit Economics & Budget Options

**Date:** 2026-11-24  
**Baseline:** `main` @ `68469cfeff09c82416778b1c09816d7005673c6c` (`G10_ENGINEERING_BASELINE = FROZEN`)  
**Canonical Repo Cost Model:** [`src/desk/polymarket/l2/l2-collector-cost-assumptions.ts`](../../src/desk/polymarket/l2/l2-collector-cost-assumptions.ts)  
**Builds On:** [`docs/poly-g10/04-SOLO-OPERATOR-UNIT-ECONOMICS.md`](./04-SOLO-OPERATOR-UNIT-ECONOMICS.md) & [`docs/poly-g8-6/04-VPS-R2-ECONOMICS-DECISION.md`](../poly-g8-6/04-VPS-R2-ECONOMICS-DECISION.md)  
**Status:** `INFRA_BUDGET = HOLD` | `VPS_R2_ACTIVATION = HOLD` | `PURCHASES_AUTHORIZED = false`

---

## 1. Live-Verified Public Provider Pricing (Retrieved `2026-11-24T13:07:00Z`)

All cloud prices below are **public list prices excl. tax/FX/card fees**, not custom account quotes. Throughput (`4.39 MB/market-hr`, 150 markets → `15.804 GB/day` raw WAL + equal Parquet allowance) remains an **`UNVERIFIED` planning assumption** until a licensed 24h qualification drill runs. Unknown data-licensing cost is strictly preserved as **`UNKNOWN`** — never replaced with `$0`.

| Provider | Source URL | Retrieved (UTC) | Verified Public List Pricing |
|---|---|---|---|
| **DigitalOcean Droplets** | `https://www.digitalocean.com/pricing/droplets` | `2026-11-24T13:07:00Z` | Per-second billing (60s min, monthly cap, effective `2026-01-01`). Basic `s-2vcpu-4gb` (2 vCPU, 4 GiB, 80 GiB SSD, 4,000 GiB transfer): `$24.00/mo` (`$0.03571/hr`). Basic `s-4vcpu-8gb` (4 vCPU, 8 GiB, 160 GiB SSD, 5,000 GiB transfer): `$48.00/mo` (`$0.07143/hr`). Dedicated General Purpose `g-8vcpu-32gb` (8 vCPU, 32 GiB, 100 GiB NVMe, 6,000 GiB): `$252.00/mo` (or 2× `g-4vcpu-16gb` @ `$126.00/mo`). Backups: 20% weekly / 30% daily of Droplet cost; Snapshots `$0.06/GB-mo`. |
| **Cloudflare R2** | `https://developers.cloudflare.com/r2/pricing/` | `2026-11-24T13:07:00Z` | Standard: `$0.015/GB-month` (ceil), Class A `$4.50/M` (ceil), Class B `$0.36/M` (ceil), Egress `$0`. Free tier (10 GB-mo, 1M Class A, 10M Class B) exists on Standard, but `l2-collector-cost-assumptions.ts` sets `freeTierDeducted = false` for fail-closed worst-case budgeting. |
| **QuickNode Polygon PoS RPC** | `https://www.quicknode.com/pricing` | `2026-11-24T13:07:00Z` | Free trial `$0/mo` (10M credits, 15 RPS, 1 mo); Build `$49.00/mo` (80M credits, 50 RPS, 24h SLA); Accelerate `$249.00/mo` (450M credits, 125 RPS, 12h SLA). |
| **Alchemy Polygon PoS RPC** | `https://www.alchemy.com/pricing` | `2026-11-24T13:07:00Z` | Free `$0/mo` (30M CU/mo, 15 RPS); Pay As You Go `$0.52/1M CUs` (300 RPS included). |
| **Hetzner Cloud (Reference)** | `https://www.hetzner.com/cloud/` | `2026-11-24T13:07:00Z` | Shared regular starting from `€5.49/mo excl. VAT`; Dedicated General Purpose starting from `€36.99/mo excl. VAT` (EUR-billed; DigitalOcean USD remains the canonical auditable USD baseline in repo code). |

*Historical reconciliation note:* Prior repo figures (`$31.06` / `$33.93` / `$59.32/mo`) reflect `s-2vcpu-4gb` (`$24.00`) + R2 fail-closed ceil ops (`$4.86`) + R2 storage (`$1.20` / `$4.07` / `$28.46`) + `$1.00–$2.00` reserve, excluding tax, FX, backups, RPC SLA, and data license. All three exceed the historical `$30.00/mo` ceiling in `l2-collector-cost-assumptions.ts:75`, and `80 GiB` local SSD leaves tight headroom (`63.22 GB` base / `126.4 GB` stress for 48h uncompressed staging).

---

## 2. Required 4-Scenario Cost Matrix (All 17 Fields)

All USD totals below are **pre-tax and pre-license** unless noted. `MONTHLY_CAP_GAP` is computed against the historical `$30.00/mo` experimental ceiling (`positive = over cap`).

| Field | Scenario A — Offline Only | Scenario B — 7-Day Licensed Pilot (150 Markets) | Scenario C — 30-Day Collector (+ 90d Continuation, 150 Markets) | Scenario D — Full PDF Research Infra (300–500+ Markets) |
|---|---|---|---|---|
| `VPS` | `$0.00` (existing workstation) | `$6.00` pro-rated 7d (`s-2vcpu-4gb` @ `$0.03571/hr`) or `$24.00/mo` full month (`$12.00` 7d on `s-4vcpu-8gb`) | Safe: `$48.00/mo` (`s-4vcpu-8gb`, 160 GiB SSD) \| Tight floor: `$24.00/mo` (`s-2vcpu-4gb`, disk risk) | `$252.00/mo` (DO `g-8vcpu-32gb` or 2× `g-4vcpu-16gb` HA pair) |
| `CPU_RAM` | Local machine (no cloud VM) | `2 vCPU / 4 GiB RAM` (`s-2vcpu-4gb`, capacity `UNVERIFIED`) | Safe: `4 vCPU / 8 GiB RAM` \| Tight floor: `2 vCPU / 4 GiB RAM` | `8 dedicated vCPU / 32 GiB RAM` (dedicated compute) |
| `STORAGE_GB` | Local disk only (fixtures) | `80 GiB SSD` local + `~63.2 GB` 7d R2 (`64 GB-mo` ceil = `$0.96`) | Safe: `160 GiB SSD` local + `271 GB-mo` base (`$4.07/mo`) to `1,897 GB-mo` stress (`$28.46/mo`) | `100–200 GiB` NVMe + `1,000–2,000 GB-mo` R2 (`$15.00–$30.00/mo`) |
| `WAL_GB_PER_DAY` | `0` | `15.804 GB/day` raw / `4.515 GB/day` @ 3.5x comp (`UNVERIFIED`) | `15.804 GB/day` raw / `4.515 GB/day` @ 3.5x comp (`UNVERIFIED`) | `30–50 GB/day` raw (`MODELED`) |
| `PARQUET_GB_PER_DAY` | `0` | `15.804 GB/day` raw / `4.515 GB/day` @ 3.5x comp (`UNVERIFIED`) | `15.804 GB/day` raw / `4.515 GB/day` @ 3.5x comp (`UNVERIFIED`) | `10–20 GB/day` compressed (`MODELED`) |
| `R2_REQUESTS` | `0` (`$0.00`) | `~1,008` A + `~2,016` B (7d) → `$4.86` fail-closed ceil (`$0.00` w/ free tier) | `4,320` A + `8,640` B/mo → `$4.86/mo` fail-closed ceil (`$0.00` w/ free tier) | `10k–50k` A + `100k–500k` B/mo → `$4.86/mo` fail-closed ceil |
| `NETWORK_EGRESS` | `$0.00` | `$0.00` (within 4,000 GiB DO transfer; R2 egress `$0`) | `$0.00` (within 5,000 GiB DO transfer; R2 egress `$0`) | `$0.00–$20.00/mo` (within 6,000 GiB DO; R2 egress `$0`) |
| `RPC` | `$0.00` (offline fixtures) | `$0.00` (not required for 7d L2 pilot; Alchemy Free 30M CU/mo optional) | `$0.00/mo` (Alchemy Free 30M CU/mo for ~150–500 resolution checks) OR `$49.00/mo` (QuickNode Build SLA) | `$249.00/mo` (QuickNode Accelerate, 450M credits, 125 RPS, 12h SLA) |
| `DATA_LICENSE` | `N/A` (offline only; `UNKNOWN` if live) | `UNKNOWN` (required in writing before pilot) | `UNKNOWN` (required in writing before Day 0) | `UNKNOWN` (ICE institutional feed/history quote required) |
| `MODEL_API` | `$0.00` | `$0.00` | `$0.00/mo` (collector only; blind forecaster LLM optional/separate) | `$50.00–$150.00/mo` (multi-model LLM ensemble research, `MODELED`) |
| `BACKUPS` | `$0.00` | `$1.00` config/manifest backup reserve | Safe: `$10.60/mo` (20% DO weekly backup `$9.60` + `$1.00` config) \| Floor: `$1.00/mo` (`$2.00/mo` stress) | `$65.40–$105.60/mo` (20%–30% DO backups `$50.40–$75.60` + DR R2 copy `$15–$30`) |
| `MONITORING` | `$0.00` | `$0.00` (lightweight local health/alert script) | Safe: `$5.00/mo` \| Floor: `$0.00/mo` (self-hosted metrics/alerts) | `$25.00–$50.00/mo` (managed metrics/logs/alerting, `MODELED`) |
| `TAX` | `$0.00` | `UNKNOWN` (billing jurisdiction VAT/GST + FX/card fee) | `UNKNOWN` (est. 5%–10% VAT + FX/card fee) | `UNKNOWN` (est. 5%–10% VAT + FX/card fee) |
| `CONTINGENCY` | `$0.00` | `$5.00` (7d spike / snapshot buffer) | Safe: `$10.00/mo` (~15% buffer) \| Floor: `$0.00/mo` | `$75.00/mo` (~10%–12% ops buffer) |
| `MONTHLY_TOTAL` | **`$0.00`** | **`$17.82`** (7d pro-rated) to **`$35.82/mo`** (full-month VPS) + `DATA_LICENSE (UNKNOWN)` + `TAX (UNKNOWN)` | **Safe: `$82.53/mo`** (`$131.53/mo` w/ QuickNode Build) \| **Floor: `$33.93/mo`** (`$59.32/mo` stress) + `DATA_LICENSE (UNKNOWN)` + `TAX (UNKNOWN)` | **`$736.26–$936.46/mo`** + `DATA_LICENSE (UNKNOWN)` + `TAX (UNKNOWN)` *(matches/exceeds PDF `$500–$800/mo` band)* |
| `90_DAY_TOTAL` | **`$0.00`** | `N/A` (7-day bounded qualification only; non-qualifying for 30d IC gate) | **Safe: `$247.59`** (`$394.59` w/ paid RPC) \| **Floor: `$101.79`** (`$177.96` stress) + `3× DATA_LICENSE (UNKNOWN)` + `TAX (UNKNOWN)` | **`$2,208.78–$2,809.38`** + `3× DATA_LICENSE (UNKNOWN)` + `TAX (UNKNOWN)` |
| `MONTHLY_CAP_GAP` | **`-$30.00`** (within cap) | `-$12.18` (7d pro-rated) to `+$5.82/mo` (30d VPS) + `UNKNOWN` license/tax | **Safe: `+$52.53/mo`** (`+$101.53/mo` w/ paid RPC) \| **Floor: `+$3.93/mo`** (`+$29.32/mo` stress) + `UNKNOWN` license/tax | **`+$706.26` to `+$906.46/mo`** + `UNKNOWN` license/tax |

*Eligible observation-day rule (Scenarios B & C):* A UTC calendar day qualifies **only** if continuous capture across the target 150-market universe has `0` unrecovered WebSocket sequence gaps, `<1%` missing heartbeat intervals, valid SHA-256 WAL/Parquet manifest verification on R2, and clean replay check. The 7-day pilot (Scenario B) is strictly an operational qualification drill and does **not** count toward the 30-day IC evidence window.

---

## 3. Economic Decision Rule Classification

Simulated strategy PnL is **never** extrapolated into infrastructure funding ability. Do **not** deploy a degraded collector (<150 markets or <30 qualifying days) merely to fit the historical `$30/mo` cap.

| Scenario | Technically Feasible | Legal / Data-Rights Feasible (Today) | Costed or Unpriced | Budget Status (vs `$30/mo` Cap) | Minimum IC Evidence Threshold | Overall Classification |
|---|---|---|---|---|---|---|
| **A — Offline Only** | Yes (offline baseline frozen) | Yes (zero live data) | Costed (`$0.00`) | Within budget (`$0`) | **Not suitable** (`30_DAY_L2 = INSUFFICIENT_DATA`) | **Active Default (`HOLD`)** while external gates resolve |
| **B — 7-Day Licensed Pilot** | Yes (measures real `bytes/market-hr` & disk spool) | **No** (`DATA_LICENSE = HOLD`, `LEGAL_G12 = HOLD`) | **Unpriced** (`DATA_LICENSE = UNKNOWN`) | Over cap if held full month; `UNKNOWN` w/ license | **Not suitable alone** (qualification drill only) | **Required pre-Day-0 drill** once license + G12 + budget pass |
| **C — 30-Day Collector (+ 90d)** | **Yes (Safe `s-4vcpu-8gb`)**; Tight floor `s-2vcpu-4gb` has 80 GiB disk risk | **No** (`DATA_LICENSE = HOLD`, `LEGAL_G12 = HOLD`) | **Unpriced** (`DATA_LICENSE = UNKNOWN`) | **Over `$30/mo` cap** even before license/tax (`$33.93–$131.53/mo`) | **Suitable** (meets 150-market × 30 qualifying days IC spec) | **Recommended target** only if `DATA_LICENSE + Safe Infra + Tax` fits Founder's revised budget |
| **D — Full PDF Research Infra** | Yes (institutional HA + SLA) | **No** (`DATA_LICENSE = HOLD`, `LEGAL_G12 = HOLD`) | **Unpriced** (ICE quote `UNKNOWN`) | **Severely over cap** (`$736–$936/mo` + license) | Suitable (exceeds minimum) | **Not suitable for solo OPC** without external institutional funding |

---

## 4. Budget Recommendation

1. **Today:** Stay on **Scenario A (`$0/mo`, `INFRA_BUDGET = HOLD`)**. Zero VPS/R2/RPC spend while `DATA_LICENSE` and `LEGAL_G12` remain `HOLD`.
2. **After Polymarket/ICE & G12 Reply:**
   - If written license is free or affordable for a solo operator → request explicit Founder budget revision to **`$85–$135/mo` + license + tax** (`$250–$400` per 90-day block excl. license) to run **Scenario B (7-day qualification)** followed by **Scenario C (Safe 30-day collector)**.
   - If Polymarket/ICE requires institutional pricing exceeding solo-founder economics → execute clean **Strategy Suspension** (no sunk infra cost; preserve capital).
