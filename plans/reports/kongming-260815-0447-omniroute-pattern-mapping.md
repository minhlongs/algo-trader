# Kongming: OmniRoute → algo-trader Pattern Mapping Report

**Date:** 2026-08-15 04:47 CST
**Source:** https://github.com/diegosouzapw/OmniRoute (v3.8.49)
**Target:** algo-trader (Alpha Vang Energy 9 Solution)

---

## Executive Summary

OmniRoute là AI proxy/router unified — hỗ trợ 290 providers, 104 MCP tools, 17 routing strategies. Dự án đã trưởng thành qua nhiều version với 22+ hard rules, git worktree isolation, và hệ thống quality gates nghiêm ngặt.

**Algo-trader nên adopt ngay:**
1. Hard Rules system (concrete, numbered, violation-tracked)
2. TDD-first bug fix protocol
3. Error sanitization pattern (never raw stack in responses)
4. Git worktree isolation cho multi-session

**Algo-trader nên bỏ qua:**
- Provider circuit breaker (290 providers) — algo-trader có Polygon.io + ccxt
- SSE snapshot handling — algo-trader dùng WebSocket, không SSE
- PII redaction on/off toggle — algo-trader không proxy user data

---

## Pattern-by-Pattern Mapping

| # | Pattern | OmniRoute | Áp dụng cho algo-trader | Hành động | Ưu tiên |
|---|---------|-----------|------------------------|-----------|---------|
| 1 | **Hard Rules System** | 22+ numbered rules, each with "why this matters", violation tracked in CI | ✅ YES — algo-trader có rules nhưng chưa có violation tracking | Implement numbered hard rules + CI gates cho violation | **HIGH** |
| 2 | **Git Worktree Isolation** | Every dev task in own worktree, never develop on shared main, never stash | ✅ YES — algo-trader multi-session nhưng chưa enforce worktree | Add Rule #19 equivalent + git worktree enforcement | **HIGH** |
| 3 | **TDD-First Bug Fix** | Write failing test → fix → confirm. Touch ONLY files test proves broken | ✅ YES — algo-trader có test nhưng chưa enforce TDD cho bugfix | Add TDD protocol to primary-workflow.md | **HIGH** |
| 4 | **Error Sanitization** | buildErrorBody() for all responses, never raw err.stack. Tests assert no leak | ✅ YES — algo-trader API endpoints cần sanitize errors | Implement buildErrorBody() pattern + regression test | **HIGH** |
| 5 | **Doc Accuracy Rules** | "Shorter doc 100% accurate beats comprehensive with fabrications" | ✅ YES — algo-trader docs cần accuracy rules | Add doc accuracy gate to docs-manager agent | **MEDIUM** |
| 6 | **Cross-Session Safety** | Never merge another session's branch, check worktree list before merge | ✅ YES — algo-trader multi-session risk | Add anti-race rules to git-manager agent | **HIGH** |
| 7 | **Input Validation (Zod)** | Zod on ALL inputs, never raw SQL in routes | ✅ YES — algo-trader API cần Zod validation | Audit existing API endpoints, add Zod schemas | **MEDIUM** |
| 8 | **Feature Flags (Opt-in)** | Data-mutating features default OFF, regression tests enforce defaults | ✅ PARTIAL — algo-trader có feature flags nhưng chưa có regression tests | Add feature flag regression tests | **MEDIUM** |
| 9 | **Coverage Gates** | 60/60/60/60 statements/lines/functions/branches | ✅ PARTIAL — algo-trader cần coverage threshold | Set coverage gates in vitest config | **MEDIUM** |
| 10 | **Provider Circuit Breaker** | 3 failure mechanisms: provider breaker, account fallback, cooldown | ❌ NO — algo-trader có 2 exchanges, không cần 290-provider resilience | Skip — over-engineering cho algo-trader | — |
| 11 | **SSE Snapshot Handling** | Parse done/completed events, sanitize standalone snapshots | ❌ NO — algo-trader dùng WebSocket, không SSE | Skip | — |
| 12 | **PII Redaction Toggle** | 3 application points, opt-in by default, regression test | ❌ NO — algo-trader không proxy user PII data | Skip | — |
| 13 | **Combo Routing (18 strategies)** | Priority, weighted, p2c, fusion, pipeline | ❌ NO — algo-trader có 2 exchanges, routing đơn giản hơn | Skip | — |
| 14 | **Bun as Script Runner** | Pinned exact version, used ONLY for gate/generator scripts | ⚠️ PARTIAL — algo-trader có thể dùng Bun cho scripts | Evaluate Bun cho CI scripts | **LOW** |
| 15 | **ESLint Suppressions JSON** | Pre-existing violations frozen, new ones must be fixed | ✅ PARTIAL — algo-trader cần suppression tracking | Implement eslint suppressions tracking | **LOW** |
| 16 | **Sonar Quality Gates** | Sonar integration for code quality | ❌ NO — algo-trader quá nhỏ cho Sonar | Skip | — |
| 17 | **Webhook HMAC + Backoff** | HMAC-signed, exponential backoff, auto-disable after 10 failures | ⚠️ PARTIAL — algo-trader có Polymarket CLOB callbacks | Implement HMAC cho CLOB callbacks | **LOW** |
| 18 | **DB Reset in Tests** | resetDbInstance() + test.after() cleanup | ✅ YES — algo-trader SQLite tests cần cleanup | Add test teardown pattern | **MEDIUM** |
| 19 | **Anti-Thundering-Herd** | Concurrent failure detection and prevention | ❌ NO — algo-trader không có concurrent provider failures | Skip | — |
| 20 | **Never on Main Checkout** | All development in worktrees, never touch main | ✅ YES — already in orchestration-protocol.md | Enforce + add CI check | **HIGH** |

---

## Adopt Immediately (HIGH priority, low effort)

### 1. Hard Rules System
**Hiện tại:** algo-trader có rules trong .claude/rules/ nhưng chưa có violation tracking
**Hành động:**
- Tạo file `AGENTS.md` với numbered hard rules (H1-H10)
- Mỗi rule có "Why this matters"
- CI gate check violation

### 2. TDD-First Bug Fix Protocol
**Hiện tại:** tester agent chạy tests nhưng chưa enforce TDD cho bugfix
**Hành động:**
- Thêm rule vào primary-workflow.md: "Bug fix MUST start with failing test"
- Thêm vào fullstack-developer.md agent definition

### 3. Error Sanitization Pattern
**Hiện tại:** algo-trader API có thể leak error details
**Hành động:**
- Tạo utility `buildErrorBody()` trong src/utils/
- Tất cả error responses phải qua utility này
- Thêm test: assert error responses không leak stack traces

### 4. Git Worktree Enforcement
**Hiện tại:** orchestration-protocol.md có rule nhưng chưa enforce
**Hành động:**
- Thêm CI check: verify worktree trước khi merge
- Thêm vào git-manager agent definition

---

## Adopt Later (MEDIUM priority, needs planning)

### 1. Zod Validation Audit
- Kiểm tra tất cả API endpoints có Zod schema chưa
- Thêm Zod cho missing endpoints

### 2. Coverage Gates
- Set vitest coverage threshold: 60/60/60/60
- CI fail nếu dưới threshold

### 3. Feature Flag Regression Tests
- Cho mỗi feature flag: test default value
- CI fail nếu default thay đổi

### 4. DB Test Cleanup
- Thêm test.after() hook cho SQLite tests
- Prevent test hanging

---

## Skip (with reason)

| Pattern | Lý do skip |
|---------|-----------|
| Provider Circuit Breaker | Algo-trader có 2 exchanges (Polygon + ccxt), không cần 290-provider resilience |
| SSE Snapshot Handling | WebSocket-based, không SSE |
| PII Redaction Toggle | Không proxy user PII data |
| Combo Routing 18 strategies | Exchange routing đơn giản hơn nhiều |
| Bun Script Runner | Node.js đủ tốt cho scripts |
| Sonar Quality Gates | Dự án quá nhỏ, overhead không worth |
| Anti-Thundering-Herd | Không có concurrent provider failures |

---

## Algo-Trader Specific Gaps

OmniRoute **không cover** nhưng algo-trader **cần**:

### 1. Trading Risk Management
- Kelly Criterion position sizing
- Drawdown protection / circuit breaker
- Portfolio risk limits
- **Không có trong OmniRoute** — cần custom implement

### 2. Polymarket CLOB Integration
- Order book management
- Price feed integrity
- Fill rate tracking
- **Không có trong OmniRoute** — cần custom implement

### 3. Multi-Region Sharding
- Region-based routing
- Shard ring management
- Health endpoint per region
- **Không có trong OmniRoute** — cần custom implement

### 4. Real-time Market Data Pipeline
- WebSocket price streams
- Multi-platform price aggregation
- Signal fusion validation
- **Không có trong OmniRoute** — cần custom implement

### 5. Backtesting Engine
- Historical data replay
- Performance metrics
- Signal quality scoring
- **Không có trong OmniRoute** — cần custom implement

---

## Actionable Recommendations — Top 5

### 1. Implement Hard Rules System (Tuần 1)
```markdown
# AGENTS.md — Hard Rules

H1: Every bug fix starts with a failing test
H2: Never develop on shared main — always worktree
H3: Error responses go through buildErrorBody()
H4: Zod validation on all API inputs
H5: Coverage ≥ 60/60/60/60
H6: No :any types in production code
H7: No console.log in production
H8: Never commit secrets
H9: Cross-session: never merge another's branch
H10: Docs must be accurate, not comprehensive
```

### 2. Add Error Sanitization Utility (Tuần 1)
```typescript
// src/utils/error-sanitizer.ts
export function buildErrorBody(err: Error, requestId?: string) {
  return {
    error: {
      message: sanitizeErrorMessage(err.message),
      code: extractErrorCode(err),
      requestId,
    },
  };
}
```

### 3. Enforce TDD for Bug Fixes (Tuần 2)
- Update primary-workflow.md Step 5
- Update fullstack-developer.md agent
- Add CI check: test file must exist before fix commit

### 4. Set Coverage Gates (Tuần 2)
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        statements: 60,
        lines: 60,
        functions: 60,
        branches: 60,
      },
    },
  },
});
```

### 5. Git Worktree Enforcement (Tuần 3)
- Add CI step: `git worktree list` check before merge
- Update git-manager agent with worktree rules
- Add to orchestration-protocol.md

---

## Unresolved Questions

1. **Algo-trader có cần provider circuit breaker không?** — Chỉ có 2 exchanges, nhưng nếu cả 2 down thì sao?
2. **Coverage threshold nên là 60 hay cao hơn?** — Trading system cần độ tin cậy cao, có thể 80?
3. **Có nên adopt Bun cho CI scripts không?** — Bun nhanh hơn Node, nhưng thêm dependency
4. **Feature flags có cần không?** — Algo-trader hiện tại không có feature flags
5. **Sonar có worth không?** — Dự án nhỏ, nhưng nếu scale lên thì sao?

---

*Report generated by kongming analysis — 2026-08-15*
