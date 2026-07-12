# Phase E: Verify & Merge

**Effort:** S
**Depends on:** Phases A, B, C, D all complete

## Overview

Run full verification suite after all 4 parallel tracks complete. Merge to `main` and deploy.

## Implementation Steps

### Step 1: Full Test Suite (Day 1-2)
```bash
pnpm test                    # Run all tests
pnpm typecheck               # 0 TypeScript errors
pnpm lint                    # Clean lint
```

- Verify all 2,798+ tests pass with zero regressions
- Fix any regressions introduced by the 4 tracks
- Verify new tests from all tracks pass (i18n, accuracy loop, backup, Telegram)

### Step 2: Protected Flow Verification
Manually verify all 3 protected flows:
1. **Setup Wizard**: BYOK API key onboarding works end-to-end
2. **Telegram Bot**: @CashClawBot responds to /campaign /status /results with live data
3. **Payment Flow**: NOWPayments IPN → tier activation (test with real $1 transaction)

### Step 3: Deploy Preview
- Run `pnpm build` — 0 errors
- Start local server, verify key pages load
- Verify locale selector works
- Verify Telegram bot commands work against live API

### Step 4: Documentation Sync
- Update `docs/development-roadmap.md` — mark Next Wave III complete
- Update `docs/project-changelog.md` — changelog entry for v3.5.0
- Update `docs/system-architecture.md` if architecture changed
- Update `README.md` if new features merit mention

### Step 5: Merge
```bash
git add -A
git commit -m "feat: Next Wave III — revenue engine + trading edge loop + infra survival + customer activation"
git push origin main
npm run deploy:full
```

### Step 6: Post-Deploy Verification
```bash
# Verify SHA match
LOCAL_SHA=$(git rev-parse HEAD | cut -c1-8)
LIVE_SHA=$(curl -s https://quant.cashclaw.cc/api/version | grep -o '"shortSha":"[^"]*"' | cut -d'"' -f4)
echo "Local: $LOCAL_SHA  Live: $LIVE_SHA"  # must match

# Verify revenue activation
curl -s https://quant.cashclaw.cc/api/health
curl -s https://quant.cashclaw.cc/api/status

# Verify Telegram
# Send /status to @CashClawBot — should return live subscriber data
```

## Success Criteria
- [ ] All tests pass, 0 type errors
- [ ] All 3 protected flows verified
- [ ] `npm run deploy:full` exit 0
- [ ] Production SHA matches local
- [ ] Docs updated (roadmap, changelog, architecture)
- [ ] Revenue flow verified with real transaction
- [ ] Telegram bot responding with live data
