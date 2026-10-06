# Third-Party Security Audit Specification & Engagement Runbook

> **Target Phase:** Phase 35 Compliance & Security Hardening  
> **Classification:** Confidential / Vendor Engagement Specification  
> **Version:** 1.0.0  
> **Effective Date:** October 2026  
> **Status:** READY FOR ENGAGEMENT  

---

## 1. Executive Summary

This document establishes the formal Request for Proposal (RFP) specification, scope definition, threat models, testing methodology, vendor evaluation rubric, and delivery acceptance criteria for engaging an accredited external cybersecurity firm to conduct a comprehensive third-party security assessment and penetration test of the **algo-trader / CashClaw** autonomous quantitative trading and hedge platform.

---

## 2. Assessment Scope & Target Surfaces

The security evaluation encompasses all software components, edge infrastructure, API contracts, database isolation barriers, and cryptographic custody mechanisms across the production deployment architecture.

### 2.1 Scope Inventory Table

| Component Identifier | Architecture / Runtime | Public Endpoint / Interface | Assessment Scope |
|----------------------|------------------------|-----------------------------|------------------|
| **Core Trading API** | Node.js / Fastify 5 / TypeScript | `https://algo-trader.workers.dev/api/v1` | REST endpoints, JWT authentication, RBAC, tenant isolation, parameter sanitization, rate-limiting |
| **Edge Web Surface** | Cloudflare Pages / Next.js 16 / React 19 | `https://cashclaw.cc`, `https://algo-trader.pages.dev` | Client security headers, XSS mitigation, CSRF tokens, session state, CORS configurations |
| **Desk CLI & Local Daemon** | Node.js 20+ ESM Executable | CLI binary (`algo-trader desk:*`) & local Unix sockets | Privilege boundaries, IPC socket security, diagnostic error sanitization, credential zero-leakage |
| **Multi-Engine Execution Loop** | TypeScript / In-Memory State Machine | Arbitrage, MARL, AMM, Alpha-Lab | Live execution guards, Quarter-Kelly position cap enforcement, order-size validation, slippage bounds |
| **Cryptographic Custody & Storage** | AES-256-GCM / PBKDF2 / WebCrypto | Database column encryption (`src/seed/security/crypto.ts`) | DEK/KEK key hierarchy, envelope encryption integrity, key rotation workflows, zero-knowledge storage |
| **Audit Log Trail** | PostgreSQL / HMAC-SHA256 Hash Chain | `tests/integration/audit-trail-e2e.test.ts` | Hash-chain tamper resistance, tenant advisory locks, non-repudiation, immutable sequencing |
| **KYC / AML Ingestion Gateway** | Fastify Router + Persona Webhook Bridge | `/api/v1/compliance/kyc/*` | Signature verification, replay prevention, PII protection, fail-closed admission |

### 2.2 Explicit Exclusions (Out of Scope)
- Denial of Service (DoS/DDoS) stress attacks against upstream third-party exchanges (Binance, Polymarket, OKX).
- Physical infrastructure breaches of Cloudflare edge POPs or Supabase managed database facilities.
- Social engineering (phishing, vishing) directed at developer personnel or open-source contributors.

---

## 3. Threat Model & Methodology

The engagement must follow the **OWASP Web Security Testing Guide (WSTG v4.2)** and **NIST SP 800-115** technical assessment standards, combining authenticated white-box static code analysis with grey-box dynamic penetration testing.

### 3.1 Primary Threat Vectors

1. **Broken Multi-Tenant Data Isolation (BOLA/IDOR):**
   - Attempting cross-tenant data leakage or execution of unauthorized orders using manipulated tenant IDs.
   - Verification that PostgreSQL row-level filtering and advisory locks strictly segment organizational data.

2. **Cryptographic Key Extraction & Memory Dump:**
   - Probing for plain-text API secrets or private exchange credentials in application dumps, log sinks, or CLI exceptions.
   - Audit of AES-256-GCM envelope encryption implementation and key derivation routines.

3. **Trading Engine Manipulation & Arbitrage Exploit:**
   - Testing whether malicious or anomalous WebSocket pricing feeds can bypass `LiveExecutionGuard` circuit breakers.
   - Validating that quarter-Kelly position sizing caps (5% hard ceiling) cannot be overridden via race conditions.

4. **Webhook Replay & State Spoofing:**
   - Attempting to replay Persona KYC verification callbacks or NOWPayments IPN notifications without valid HMAC signatures.
   - Verifying idempotency keys and timestamp tolerance windows on all asynchronous hooks.

5. **Local IPC & CLI Privilege Escalation:**
   - Evaluating local Unix socket permissions and daemon control endpoints (`algo-trader desk:auto`).
   - Verifying that non-privileged user accounts cannot issue order execution commands on the local machine.

---

## 4. Vendor Engagement & Selection Criteria

### 4.1 Required Vendor Accreditations
Prospective auditing firms must demonstrate:
- **CREST** (Council of Registered Ethical Security Testers) accredited penetration testing status.
- Primary testing consultants holding **OSCP**, **OSCE**, or **CISSP** credentials.
- Demonstrable past experience auditing high-throughput FinTech, algorithmic execution systems, or digital asset trading platforms.

### 4.2 Candidate Firms Shortlist
1. **Trail of Bits** — Leading specialist in automated systems, smart contracts, and high-assurance software engineering.
2. **NCC Group** — Global cybersecurity consultancy with established FinTech and crypto security testing practices.
3. **Cure53** — Premier web application, API, and cryptographic library penetration testing firm.
4. **Bishop Fox** — Elite offensive security and red-teaming firm specializing in cloud-native and edge platforms.

---

## 5. Engagement Schedule & Timeline

```
Week 0: Vendor RFP Review, NDA Execution, and Scoping Call
Week 1: Pre-Audit Environment Provisioning (Isolated Staging Replica + Synthetic Balances)
Week 2: Static Analysis (SAST), Architecture Review & Threat Modeling
Week 3: Dynamic Application Penetration Testing (DAPT) & Multi-Tenant Exploitation Probing
Week 4: Preliminary Findings Report & Triage Discussion
Week 5: Remediation Sprint by Core Engineering Team
Week 6: Verification Re-Test & Delivery of Final Attestation Certificate
```

---

## 6. Deliverables & Acceptance Criteria

To achieve complete certification and gate closure for Phase 35, the auditing vendor must provide:

1. **Executive Summary Report:** Non-technical impact assessment for executive stakeholders and regulatory compliance.
2. **Technical Vulnerability Register:** Detailed vulnerability cards with reproducible proof-of-concept (PoC) scripts, CVSS v3.1 scores, affected line references, and remediation guidance.
3. **Cryptographic Verification Letter:** Specific sign-off on AES-256-GCM key management and HMAC audit hash-chain integrity.
4. **Final Letter of Attestation (Public Certificate):** Clean attestation verifying all Critical and High vulnerabilities have been resolved, suitable for publishing to enterprise institutional clients.
