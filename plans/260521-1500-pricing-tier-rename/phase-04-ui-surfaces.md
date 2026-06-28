# Phase 04 — UI surfaces (landing, admin, dashboard, telegram)

**Priority:** P1
**Status:** pending
**Depends on:** Phase 03

## Goal

All customer-visible surfaces show canonical pricing: **Starter $49 / Pro $149 / Growth $399**.

## Files to modify

### `src/landing/public/index.html`
- `:677` `price-starter` = `$49` ✓ (already correct).
- `:694` `price-pro` = `$149` ✓.
- **Add Growth card** at $399 (currently 2-tier; need 3-tier pricing block).
- Meta description `:7,15` — keep "From $49/mo" ✓.

### `src/landing/public/admin.html`
- `:63` `<option value="pro">Pro ($149/mo)</option>` ✓ keep.
- Change `<option value="enterprise">Enterprise ($499/mo)</option>` → `<option value="growth">Growth ($399/mo)</option>`.
- Add `<option value="starter">Starter ($49/mo)</option>` before Pro.
- Update form submit handler if it posts the tier string (route to `normalizeTier`-friendly value `'GROWTH'`).

### `src/dashboard/public/index.html`
- `:486` `ENTERPRISE ($199/mo)` → `GROWTH ($399/mo)`.
- Add STARTER row if the dashboard shows a tier ladder elsewhere — grep first.

### `src/telegram/auto-support-handlers.ts`
- `:87` pricing message — replace whole block:
  ```
  *Starter — $49/mo*
  Daily signal digest, AI edge scores, Kelly sizing recommendations

  *Pro — $149/mo* (Most Popular)
  Real-time signals, REST API, auto-execution, priority support

  *Growth — $399/mo*
  Multi-exchange, intelligence swarm, multi-leg execution, priority support
  ```

## Implementation steps

1. Edit each file above.
2. Grep for any other `\$199\|\$499` in `src/` that may be stale pricing:
   ```
   grep -rn '\$199\|\$499' src/ | grep -iE 'price|tier|mo' 
   ```
3. Verify landing page renders 3 tier cards if rendered via SSR/Vite (`cd dashboard && npm run dev` not required unless code path is reachable).

## Acceptance

- [ ] No `$199`, `$499`, `$99` (in pricing context), or `$299` strings remain in UI files (except in changelog history).
- [ ] All 3 tiers (Starter/Pro/Growth) appear on landing, admin form, and Telegram pricing message.
- [ ] Admin form submits `'GROWTH'` (not `'enterprise'`).
