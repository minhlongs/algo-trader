---
phase: 3
title: "Hook Test Coverage — 16 Custom Hooks"
status: pending
priority: P2
dependencies: []
---

# Phase 3: Hook Test Coverage — 16 Custom Hooks

## Overview
Write Vitest test files for all 16 custom hooks in `src/hooks/` to match existing 273-test suite.

## Requirements
- Functional: Each hook has a `*.test.ts` with unit tests covering happy path, error states, and edge cases
- Non-functional: Test patterns match existing convention (mock stores, mock fetch, describe/it syntax)
- Coverage: ≥80% on hook logic

## Architecture
Test strategy per hook:
1. **Data-fetching hooks** — Mock API responses, test loading/error/success states
2. **Store-integration hooks** — Mock Zustand store, test selector behavior
3. **WebSocket hooks** — Mock socket client, test connect/disconnect/message flow
4. **Form/submission hooks** — Mock submit function, test validation and feedback

## Related Code Files

### Hooks requiring tests (16 files)
| Hook File | Pattern | Priority |
|-----------|---------|----------|
| `use-subscriber-pnl.ts` | Data fetching | High |
| `use-dashboard-websocket.ts` | WebSocket | High |
| `use-websocket-price-feed.ts` | WebSocket | High |
| `use-realtime-updates.ts` | WebSocket | Medium |
| `use-health-status.ts` | Polling | Medium |
| `use-pnl-analytics.ts` | Data fetching | Medium |
| `use-license-analytics.ts` | Data fetching | Medium |
| `use-revenue-analytics.ts` | Data fetching | Medium |
| `use-marketplace.ts` | Data fetching | Medium |
| `use-audit-logs.ts` | Data fetching | Low |
| `use-licenses.ts` | Data fetching | Low |
| `use-coupons.ts` | Data fetching | Low |
| `use-create-license.ts` | Mutation | Low |
| `use-admin-controls.ts` | Store integration | Medium |
| `use-api-client.ts` | Utility | Low |
| `use-xai.ts` | Data fetching | Low |

## Implementation Steps

### Step 1: Read existing test patterns
Check existing test files for patterns:
```bash
ls src/hooks/__tests__/ 2>/dev/null || ls src/components/*/__tests__/ 2>/dev/null
```
Match: describe/it blocks, mock implementations, expect assertions.

### Step 2: Write tests for data-fetching hooks (batch)
Pattern template:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSubscriberPnl } from '../use-subscriber-pnl';

vi.mock('../stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

describe('useSubscriberPnl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns loading state initially', () => {
    vi.mocked(useAuthStore).mockReturnValue({ tenantId: 'test' } as any);
    const { result } = renderHook(() => useSubscriberPnl('test'));
    expect(result.current.loading).toBe(true);
  });

  it('returns data on success', async () => {
    // mock fetch, assert result
  });

  it('handles error gracefully', async () => {
    // mock failed fetch, assert error state
  });
});
```

### Step 3: Write tests for WebSocket hooks
Mock socket connection:
```typescript
vi.mock('@/lib/websocket-client', () => ({
  createWebSocket: vi.fn(() => mockSocket),
}));
```

### Step 4: Write tests for store hooks
Mock Zustand store:
```typescript
vi.mock('../stores/trading-store', () => ({
  useTradingStore: vi.fn(() => mockStoreState),
}));
```

### Step 5: Run full test suite
```bash
npx vitest run
```
Target: 0 failures, ≥80% coverage on hooks.

## Success Criteria
- [ ] 16 `*.test.ts` files created in `src/hooks/__tests__/` or alongside hooks
- [ ] Each test file has ≥3 test cases (loading, success, error)
- [ ] WebSocket hooks test connect/disconnect/reconnect
- [ ] `npx vitest run` passes with 0 failures
- [ ] No mocks of internal implementation (mock only external: fetch, WebSocket, stores)

## Risk Assessment
- **Risk**: Over-mocking makes tests brittle → Mitigation: Mock only external boundaries (network, stores, WS), not internal helpers
- **Risk**: Test flakiness from async timing → Mitigation: Use `waitFor` + `act` from testing-library
- **Risk**: Duplicating integration tests → Mitigation: Unit tests only; integration tests already exist
