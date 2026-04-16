---
phase: 01
name: Decisions gate + docs/manifesto.md
priority: P0
status: completed
blocks: [02, 03, 04]
shipped: commit 39fc54b
---

# Phase 01 — Decisions Gate + Manifesto Doctrine

## Context Links
- `plan.md` (parent)
- `docs/BINH_PHAP_TRADING.md` (existing strategy doc to cite in manifesto)
- `~/.claude/projects/-Users-macbookprom1/memory/feedback_a16z_solo_company_doctrine.md` (doctrine source)
- Brainstorm report §3 (recommended structure), §4 (copy guidelines)

## Overview
- **Priority:** P0 — blocks all other phases
- **Status:** pending
- **Brief:** Chốt 5 unresolved quyết định → viết `docs/manifesto.md` ≤150 dòng theo 5-chapter structure

## Key Insights
- Manifesto = first chính danh artifact. Phải đúng tone trước khi public.
- Ch. V "What we WON'T do" chính là điểm differentiate với hype competitors — giữ nguyên, không làm mềm.
- a16z cite phải có nguồn rõ (Andreessen tweet/post + Amodei probability), không claim endorsement.
- Polar-safe check BẮT BUỘC trước khi publish — scrub toàn bộ "AI/health/wellness".

## Requirements

### Functional
- `docs/manifesto.md` exists, ≤150 dòng, 5 chapters
- README.md có link đến manifesto
- Copy đã pass Polar-safe audit (grep "AI|health|wellness|therapeutic|medical|fitness" = 0 visible text matches)
- 5 unresolved decisions được record trong manifesto header frontmatter

### Non-functional
- Tone: honest, concise, no hype
- Citation format: inline link + date cho a16z/Amodei sources
- Dual-language policy ghi rõ trong header (nếu chọn song ngữ)

## Decisions Gate (USER MUST ANSWER)

| # | Question | Options | Default if silent |
|---|---|---|---|
| D1 | Domain binding | `algo-trade.xyz` new / sub of `cashclaw.cc` / sub of `agencyos.network` | sub of `cashclaw.cc` → `quant.cashclaw.cc` (zero new cost) |
| D2 | Manifesto ngôn ngữ | Eng-only / VN-only / dual EN+VN | Eng-only (Polymarket audience quốc tế) |
| D3 | Live P&L timing | Phase 2 $500 immediately / đợi $5K | $500 immediately (transparency compounding) |
| D4 | Build-in-public channel | Twitter/X chính / HN chính / cả hai | Cả hai (Twitter weekly, HN monthly milestone) |
| D5 | Manifesto license | CC0 / CC-BY / MIT | CC-BY 4.0 (attribution guaranteed, remix allowed) |

## Architecture

### Manifesto structure (5 chapters)
```
docs/manifesto.md
├── Frontmatter: license, decisions D1-D5 recorded
├── Preamble: solo quant desk positioning sentence
├── Ch. I   a16z Solo Company Thesis (cite Andreessen + Amodei 70-80%)
├── Ch. II  Binh Pháp 13 Chapters → Trading Function Mapping
├── Ch. III Zero-Overhead Stack (M1 Max, DeepSeek R1 local, CF Pages, D1)
├── Ch. IV  Open Methodology (link BINH_PHAP_TRADING.md, 150 paper trades)
└── Ch. V   What We WON'T Do (no team, no outside capital, no signal sales)
```

### Polar-safe copy rules
- ✅ "solo quant desk", "autonomous trading agent", "algorithmic event trader", "prediction-market participant"
- ❌ "AI trading" (visible), "AI-powered", "AI-native" (replace with "autonomous agent")
- ❌ "health", "wellness", "therapeutic", "medical", "fitness"
- ✅ "paper-trade methodology, 150 trades, 14.6-25.3% avg edge (pre-resolution)"
- ❌ "profitable", "market-beating", "proven edge", "guaranteed"

## Related Code Files

### To create
- `docs/manifesto.md`

### To modify
- `README.md` — add link to manifesto in hero section

### Reference only
- `docs/BINH_PHAP_TRADING.md` — cite in Ch. IV

## Implementation Steps
1. Present 5 decisions (D1-D5) to user via AskUserQuestion — single call, all 5
2. Record answers in manifesto frontmatter `decisions:` block
3. Draft Ch. I (a16z thesis, ≤30 lines): Andreessen billion-dollar thesis + Amodei 70-80% probability + Pieter Levels $3M/yr + Midjourney $4.7M/employee
4. Draft Ch. II (Binh Pháp mapping, ≤35 lines): 13 chapters → trading function (始計=thesis research, 作戰=position sizing, 謀攻=parsing alpha, etc. — reuse Binh Pháp mapping from memory)
5. Draft Ch. III (zero-overhead stack, ≤25 lines): itemize costs = $0, hardware/software/infra
6. Draft Ch. IV (methodology, ≤25 lines): 150 paper trades numbers, link BINH_PHAP_TRADING.md, blind prompt strategy, DeepSeek R1 32B-4bit
7. Draft Ch. V (anti-commitments, ≤30 lines): NO team, NO outside capital pre-validation, NO signal sales pre-55%, NO AI-keyword marketing (Polar)
8. Polar-safe audit: `grep -iE "\bAI\b|health|wellness|therapeutic|medical|fitness" docs/manifesto.md` — fix any matches in visible text
9. Add link to `README.md` hero section
10. Commit: `docs: add solo quant desk manifesto (dual-layer positioning)`

## Todo List
- [x] Run AskUserQuestion for D1-D5
- [x] Record decisions in frontmatter
- [x] Write Ch. I — a16z thesis citation
- [x] Write Ch. II — Binh Pháp 13-chapter mapping
- [x] Write Ch. III — zero-overhead stack enumeration
- [x] Write Ch. IV — open methodology
- [x] Write Ch. V — anti-commitments
- [x] Polar-safe audit (grep check)
- [x] Update README.md with manifesto link
- [x] Commit & push (commit 39fc54b)

## Success Criteria
- `docs/manifesto.md` exists, `wc -l` ≤ 150
- 5 chapters all present (grep headers)
- Frontmatter records D1-D5 answers
- Polar-safe grep returns 0 matches in visible body text
- README.md links to manifesto in first 30 lines

## Risk Assessment

| Risk | Mitigation |
|---|---|
| a16z cite perceived as hype | Use direct quote + date + link, phrase as "we apply the thesis", not "we are a16z-backed" |
| VN-flavor alienates Polymarket | D2 default = Eng-only; VN as translation track, not primary |
| Anti-commitments too preachy | Keep Ch. V ≤30 lines, factual, no moral tone |
| Polar-unsafe copy slips through | Automated grep audit mandatory before commit |

## Security Considerations
- No API keys, private addresses, or capital amounts in manifesto (Phase 03 dashboard will handle live numbers separately)
- License CC-BY 4.0 = allow remix but require attribution; protects against misquote

## Next Steps
- Blocks Phase 02 (landing page needs manifesto route target)
- After commit, signal user to run Phase 02
