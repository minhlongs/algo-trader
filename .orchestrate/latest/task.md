# Task: Củng cố LLM router — chuyển các module intelligence còn dùng raw fetch() sang LlmRouter.chat()

## Request
User đã có sẵn `http://omnimbp.local:20128` và muốn tất cả LLM calls trong trading pipeline đi qua OmniRoute gateway. Phần enforce trong `llm-router.ts` đã xong (tests xanh, tsc sạch). Task còn lại: di chuyển các module intelligence còn gọi LLM trực tiếp bằng `fetch()` sang dùng `LlmRouter.chat()` duy nhất.

## Goal
Trothanh mọi `fetch(`${endpoint}/chat/completions`)` còn sót trong intelligence modules bằng `LlmRouter.chat()` để đảm bảo 100% traffic LLM đi qua OmniRoute gateway.

## Scope
Task #4 (pending): Replace raw fetch LLM calls with LlmRouter in 9 intelligence modules:
- `src/desk/intelligence/signal-validator.ts`
- `src/intelligence/signal-consensus-swarm.ts`
- `src/desk/intelligence/dual-level-reflection-engine.ts`
- resolution-criteria-analyzer
- logical-hedge-discovery
- semantic-dependency-discovery
- probability-calibrator
- news-impact-analyzer
- `src/desk/arbitrage/self-evolving-ilp-constraints.ts`

## Constraints
- Giữ nguyên `tsc --noEmit` = 0 errors
- Giữ test hiện tại xanh
- Không introduce `:any` mới
- Không đổi signature / exported types / API contracts
- Giữ nguyên fail-closed / GpuMutex / semantic cache behavior

## Non-goals
- Không sửa `llm-router.ts`
- Không thêm feature routing mới
- Không đổi env/config schema

## Acceptance Criteria
1. Không còn raw LLM `fetch()` trong intelligence modules scope
2. Tất cả đều gọi qua `LlmRouter.chat()` duy nhất
3. `tsc --noEmit` clean
4. Tests existing xanh
5. Không regression business logic / public contract
