---
title: Solo-Platform RaaS Bootstrap Analysis
date: 2026-04-16
source: DeepSeek - Solo-Platform.pdf (226 pages)
status: completed
---

## 1. Vision & Thesis (2-4 bullets)

- **Solo-Platform**: "Hát giống → Đất hạ tầng" (Seed → Seedlings → Trees → Forest) progression from local agent monorepo to distributed enterprise-grade AI system
- **Why now**: B2B enterprise 2026 demands on-premise/air-gapped AI ops (data sovereignty), "không rời khỏi vùng dữ liệu". Market: B2B B2B On-Premise AI Agent Factory targeting solopreneurs + enterprises unwilling to trust cloud inference
- **Core differentiation**: BYOK (Bring Your Own Keys) + zero data leakage + heterogeneous multi-LLM orchestration (Ollama local + cloud LLM fallback) + attestation-verified agent execution via Citadel Protocol
- **Revenue unlock**: RaaS per-seat ($49k–$499k+) or outcome-based (% of agent earnings). Platform solves "cold start" for B2B to deploy autonomous agent teams on-premise

## 2. Product Scope

**In:**
- Multi-agent orchestration (OpenClaw + PaperClip CEO agent)
- Citadel Protocol (TEE/SGX attestation for agent code + DID binding)
- WebAssembly Sandbox (Wasm) + IronClaw (stateless + persistent leak detection)
- vLLM on-premise (Llama 3, Qwen) + local Ollama fallback
- Kubernetes deployment (Giai Doan 4) + monitoring (Prometheus/Grafana, Alertmanager)
- Data residency guarantees (AES-256, mTLS, air-gapped networking)
- B2B compliance: GDPR, SOC 2, ISO 27001, HIPAA

**Out:**
- SaaS cloud-only deployment (abandoned for on-premise focus)
- Consumer-facing product
- Real-time multi-agent training (batch only)

## 3. Tech Stack Recommendations

**Runtime**: vLLM (inference engine) + Ollama (local dev fallback) + Wasm Sandbox + IronClaw DLP proxy
**Storage**: PostgreSQL (attestation records, agent bindings) + ChromaDB (embeddings) + Velero (backup)
**Auth**: Keycloak (SSO/LDAP) + Open Policy Agent (OPA) for fine-grained RBAC
**Deployment**: Docker Compose (local), Kubernetes (production), Zarif package manager (Airgap-ready)
**Observability**: Prometheus metrics + Grafana dashboards + OpenTelemetry (OTel) tracing
**Agent isolation**: Citadel Protocol (TEE verification) + Wasm capability enforcement + DID-based "Root of Trust"

## 4. Architecture Pillars (max 5)

1. **Giai Doan 1** (Seed): Local monorepo with Base Agent, Memory (SQLite + Chroma), Tools framework
2. **Giai Doan 2** (Cây): Multi-tenant API Gateway + FastAPI + Redis worker pool + JWT attestation
3. **Giai Doan 3** (Rừng): PostgreSQL federation + temporal workflow engine + Stripe billing
4. **Giai Doan 4** (Dát hạ tầng): Kubernetes orchestration + Citadel attestation + IronClaw DLP + self-healing operators
5. **Giai Doan 5-6**: B2B marketplace + blockchain settlement + edge network distribution

## 5. Monetization Model (RaaS Pricing, BYOK, Revenue Split)

**Pricing tiers**: Starter ($49k/yr, 5 agents, email support) → Professional ($149k, unlimited agents, 24/7 SLA 99.5%) → Enterprise ($499k+, air-gapped, custom compliance, dedicated TAM)

**BYOK**: Customers bring AWS/Azure/on-premise infra. Platform runs agent orchestrator + attestation verifier (zero secret storage in Solo-Platform). Customer controls all API keys, LLM endpoints, data residency.

**Revenue split** (B2B agency model): Per-agent seat licensing OR outcome-based (% of revenue agent generates). Comp AI compliance ($90/mo) optional for SOC 2 attestation audit logs.

**Anti-pattern caught**: Polar rejected "wellness/health" positioning → pivot to "autonomous operations management SaaS" language

## 6. Phasing & Milestones

- **D1 (Q2 2026)**: Giai Doan 1 + 2 complete. 5 agents. Local K3s test.
- **D2 (Q3 2026)**: Citadel Protocol integration (TEE + DID binding + quote verification). Enterprise attestation pipeline.
- **D3 (Q4 2026)**: IronClaw DLP proxy + Wasm sandbox + OPA policies. Air-gapped compliance ready.
- **D4 (Q1 2027)**: Kubernetes operator rollout. Self-healing, multi-cloud failover.
- **D5+ (2027)**: B2B marketplace. Blockchain settlement. Usage-based / Outcome-based pricing models.

## 7. Risks & Anti-Patterns

- **Citadel complexity**: SGX/TDX availability varies by cloud provider. Fallback to simulation mode (not ideal for compliance-sensitive enterprise).
- **Agent sandbox escape**: Wasm + IronClaw + capability enforcement stacking required; single gap = data exfil.
- **Vendor lock-in to TEE hardware**: Plan Zarf + Harbor for air-gap, but attestation tightly coupled to Intel SGX (SDX)/AMD SEV (TDX).
- **Licensing/attestation cost spiral**: Comp AI audit-logging can become $90–$500/month per tenant if over-engineered.
- **Hybrid deployment complexity**: 4-layer defense-in-depth (Wasm + IronClaw + Citadel + OPA) hard to debug when security breach occurs.

## 8. Reuse vs New-Build (vs algo-trader)

**Reuse from algo-trader**:
- D1 manifesto + Better Auth (already shipped)
- D1 sync strategy (D1 already live in algo-trader)
- Multi-LLM orchestration pattern (DeepSeek R1 + Qwen logic reusable)

**New-build for Solo-Platform**:
- Citadel Protocol implementation (zero existing code)
- Wasm Sandbox + IronClaw integration (new security perimeter)
- OPA policy engine + Keycloak RBAC (separate from algo-trader auth)
- B2B compliance audit trail (GDPR/SOC 2 logging, not in algo-trader)
- Kubernetes operator framework (K8s-specific; algo-trader is Cloudflare Pages)

**Risk**: Tight coupling Citadel to attestation means can't reuse attestation verifier from algo-trader without rework.

## 9. Open Questions

1. **Citadel Protocol maturity**: Is SGX/TDX quote validation audited? PDF references Intel PCCS but no third-party audit listed.
2. **BYOK key rotation**: How does customer rotate API keys without re-deploying all agents? No clear KMS handoff protocol.
3. **B2B pricing model clarity**: Is outcome-based (% of agent earnings) feasible without agent-generated audit logs? Fraud risk?
4. **Compliance audit timeline**: SOC 2 Type II requires 6+ months operation. When target launch for enterprise sales?
5. **IronClaw + Wasm interaction**: Can Wasm sandbox call IronClaw DLP proxy? Latency/performance impact unbounded?
6. **Agent marketplace**: Page references "B2B On-Premise AI Agent Factory" but no schema for agent code signing, distribution, payment. How is agent provenance tracked?

---

**Summary**: Solo-Platform is B2B RaaS for on-premise autonomous agent teams. Differentiation = Citadel attestation + BYOK + zero data leakage + heterogeneous LLM. Phasing clear (Giai Doan 1-7). Primary risk = Citadel Protocol complexity & SGX/TDX hardware availability. Revenue model per-seat ($49k–$499k) or outcome-based; exact terms TBD. Reuse algo-trader manifesto + auth; new-build security perimeter (Wasm + IronClaw + OPA).

**Token estimate**: ~145 lines. Compressed grammar, sacrificed clarity for concision per brief.
