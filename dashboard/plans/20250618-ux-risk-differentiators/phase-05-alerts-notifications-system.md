---
phase: 05
title: Alerts & notifications system
status: completed
priority: P1
---

# Phase 05 — Alerts & Notifications System

## Context

Non-blocking toast notifications for risk events, with severity levels and user preferences. Replaces inline toasts with centralized system supporting multiple concurrent alerts, persistence, and user action buttons.

## Architecture

- Zustand store for notification queue and preferences
- Toast container component fixed to viewport
- Severity levels: info, warning, error, critical
- Actions: dismiss, snooze, view details, take corrective action
- Respect user preferences (email, push, severity threshold)

## Implementation Steps

1. **Create notifications store** (`src/stores/notifications-store.ts`):
   - Interface: `Notification { id, type, severity, title, message, timestamp, read, actions: [] }`
   - State: `notifications[]`, `preferences`
   - Actions: `addNotification`, `dismiss`, `markRead`, `updatePreferences`, `clearAll`
   - Auto-dismiss after timeout (configurable, default 5s for info, persistent for error/critical)
   - Queue management: max N visible, oldest auto-dismiss

2. **Create ToastItem component** (`src/components/notifications/ToastItem.tsx`):
   - Props: `notification`, `onDismiss`, `onAction`
   - Visual: colored border/icon based on severity
   - Layout: icon + content + close button + optional action buttons
   - Animations: slide-in/out, stack properly
   - <100 lines

3. **Create ToastContainer** (`src/components/notifications/ToastContainer.tsx`):
   - Fixed position (top-right or bottom-right)
   - Stack toasts vertically with spacing
   - Max height with scroll if overflow
   - Subscribe to notifications store
   - Render all active notifications
   - <80 lines

4. **Create NotificationPreferencesForm** (`src/components/notifications/NotificationPreferencesForm.tsx`):
   - Checkboxes: enable/disable email, push
   - Severity threshold selector (radio buttons or dropdown)
   - Sound toggle (optional)
   - Save to store (or risk preferences store)
   - <100 lines

5. **Integrate into app**:
   - Add `<ToastContainer />` to `LayoutShell` in `App.tsx`
   - Replace inline toast in `neg-risk-dashboard-page.tsx` with `addNotification` call
   - Add preference form to settings page (phase 6)

6. **Add tests**:
   - Test store: add, dismiss, preferences
   - Test ToastContainer renders notifications
   - Test ToastItem actions
   - Test auto-dismiss timer

## Files to Create

- `src/stores/notifications-store.ts`
- `src/components/notifications/ToastContainer.tsx`
- `src/components/notifications/ToastItem.tsx`
- `src/components/notifications/NotificationPreferencesForm.tsx`
- `src/hooks/use-notifications.ts` (optional convenience hook)
- `src/components/notifications/__tests__/notifications.test.tsx`

## Files to Modify

- `src/App.tsx` (wrap app with ToastContainer or add to LayoutShell)
- `src/stores/neg-risk-scanner-store.ts` (use notifications instead of inline toast)
- `src/components/risk/ProactiveControlsPanel.tsx` (emit notifications on rule triggers)
- `src/pages/settings-page.tsx` (add notification preferences section)

## Success Criteria

- Notifications appear and dismiss correctly
- Multiple toasts stack without overlap
- Severity levels visually distinct
- Preferences persist (localStorage or server)
- Non-blocking: user can continue working while toasts visible
- Tests cover store logic and component rendering

## Risk Assessment

- Low: Toast spam → implement rate limiting, coalesce similar messages
- Low: Important alert dismissed accidentally → critical alerts persist until explicitly acknowledged
- Medium: Z-index conflicts with other fixed elements → use high z-index (≥1000), test interactions
