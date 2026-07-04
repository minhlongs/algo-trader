---
phase: 3
title: "Dashboard Chat Widget"
status: pending
effort: "M (3-4 days)"
---

# Phase 3: Dashboard Chat Widget

## Overview

Add AI Co-pilot chat widget to the web dashboard. Floating action button (FAB) → slide-out chat panel. Message bubbles, typing indicator, action buttons on responses.

## Architecture

```
┌─────────────────────────────────────┐
│         Dashboard Layout             │
│  ┌─── Sidebar ──┐ ┌── Main ──────┐  │
│  │              │ │               │  │
│  │              │ │  ┌─ FAB ───┐  │  │
│  │              │ │  │  💬    │  │  │
│  │              │ │  └────────┘  │  │
│  └──────────────┘ └──────────────┘  │
│                                      │
│  ┌──── Chat Panel (slide-out) ────┐  │
│  │  💬 AI Co-pilot           ✕   │  │
│  │  ─────────────────────────── │  │
│  │  [Bot] Welcome! Ask me...   │  │
│  │  [User] what's my risk?    │  │
│  │  [Bot] Risk assessment...   │  │
│  │  [Bot] [📊 View Dashboard]  │  │
│  │  ─────────────────────────── │  │
│  │  │ Type a question... │ 📎 │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Files

```
Create:
├── dashboard/src/components/co-pilot/
│   ├── co-pilot-chat.tsx            — Chat panel container
│   ├── co-pilot-fab.tsx             — Floating action button
│   ├── co-pilot-message.tsx         — Message bubble (bot/user)
│   ├── co-pilot-actions.tsx         — Action buttons row
│   └── co-pilot-input.tsx           — Text input + send button
├── dashboard/src/stores/co-pilot-store.ts          — Zustand store: messages, loading, history
└── dashboard/src/components/__tests__/
    └── co-pilot-chat.test.tsx                      — Component tests

Modify:
└── dashboard/src/App.tsx                           — Mount CoPilotChat component
```

## Implementation Steps

### Step 1: Co-pilot Store
Create `dashboard/src/stores/co-pilot-store.ts`:

```typescript
import { create } from 'zustand'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: ActionButton[]
  timestamp: number
}

interface CoPilotState {
  messages: Message[]
  isOpen: boolean
  isLoading: boolean
  sendQuery: (query: string) => Promise<void>
  toggleOpen: () => void
  clearHistory: () => void
}

// Zustand store
// sendQuery: POST /api/v1/co-pilot/ask → push response to messages
// Stores last N messages in localStorage for persistence
```

### Step 2: FAB Component
Create `dashboard/src/components/co-pilot/co-pilot-fab.tsx`:

- Fixed position: bottom-right, z-50
- Pulse animation when unread
- Badge count of unread responses
- Click → toggle chat panel
- Keyboard shortcut: Ctrl+/ to open

### Step 3: Chat Panel
Create `dashboard/src/components/co-pilot/co-pilot-chat.tsx`:

- Slide-out panel from right (CSS transition)
- Header: "AI Co-pilot" + close button
- Scrollable message list (auto-scroll to bottom)
- Typing indicator ("AI is thinking...") while loading
- Quick action chips (suggested queries):
  - "What's my risk exposure?"
  - "Find arb opportunities"
  - "Market regime?"
  - "Generate report"

### Step 4: Message Bubbles
Create `dashboard/src/components/co-pilot/co-pilot-message.tsx`:

- Bot messages: left-aligned, gray background, bot avatar
- User messages: right-aligned, blue background
- Markdown rendering for bot responses
- Error state: red border, retry button
- Loading state: typing dots animation

### Step 5: Action Buttons
Create `dashboard/src/components/co-pilot/co-pilot-actions.tsx`:

- Renders ActionButton[] from API response
- "📊 View Dashboard" → navigate to relevant page
- "🔄 Refresh" → re-run query
- "📋 Copy" → copy response to clipboard
- "⚠️ Acknowledge" → dismiss warning
- Styled as pill buttons

### Step 6: Input Bar
Create `dashboard/src/components/co-pilot/co-pilot-input.tsx`:

- Text input with Send button
- Enter to send, Shift+Enter for newline
- Disabled while loading
- Character limit: 500
- Attachment icon (future: screenshot, CSV upload)

### Step 7: Mount in App
In `dashboard/src/App.tsx`, import CoPilotChat and mount OUTSIDE the `<Routes>` block but INSIDE `<ErrorBoundary>`:

```typescript
import { CoPilotChat } from './components/co-pilot/co-pilot-chat'

export function App() {
  return (
    <ErrorBoundary onError={handleGlobalError}>
      <Routes>
        {/* ... existing routes ... */}
      </Routes>
      <CoPilotChat />  {/* Mounted outside Routes, visible on all pages */}
    </ErrorBoundary>
  )
}
```

NOTE: App.tsx uses `<Routes><Route>` pattern with `AuthGuard` wrapper. CoPilotChat should be mounted after the `</Routes>` closing tag, not inside any route. This ensures it renders on all dashboard pages.

### Step 8: Keyboard Shortcut
Ctrl+/ opens chat — BUT Ctrl+/ in browsers triggers browser shortcut menu. Use `Ctrl+Shift+/` or `Ctrl+B` instead. Document in component comment.

### Step 9: XSS Sanitization
All bot message content from the API response must be sanitized before rendering as markdown. Use DOMPurify or similar library. The plan already references sanitization in the risk section — make it explicit in implementation.

### Step 10: Tests
Create `dashboard/src/components/__tests__/co-pilot-chat.test.tsx`:

- FAB renders and is clickable
- Chat panel opens/closes
- Messages display correctly
- Loading state shows typing indicator
- Error state shows retry button
- Action buttons clickable
- Input field accepts text
- Submit sends API request

## Related Files
- `dashboard/src/components/co-pilot/co-pilot-chat.tsx`
- `dashboard/src/components/co-pilot/co-pilot-fab.tsx`
- `dashboard/src/components/co-pilot/co-pilot-message.tsx`
- `dashboard/src/components/co-pilot/co-pilot-actions.tsx`
- `dashboard/src/components/co-pilot/co-pilot-input.tsx`
- `dashboard/src/stores/co-pilot-store.ts`
- `dashboard/src/App.tsx`

## Success Criteria
- [ ] FAB renders in bottom-right corner with pulse animation
- [ ] Click FAB → chat panel slides in
- [ ] User types query → loading indicator → bot responds
- [ ] Markdown rendered in bot messages
- [ ] Action buttons clickable and trigger correct actions
- [ ] Quick action chips render suggested queries
- [ ] Error state shows retry button
- [ ] Keyboard shortcut Ctrl+/ opens chat
- [ ] Message history persists across page navigations
- [ ] All component tests pass

## Risk Assessment
- **Chat panel overlaps other UI** — Mitigation: proper z-index, mobile-responsive
- **Markdown rendering security** — Mitigation: sanitize bot responses, no raw HTML
- **API errors in chat** — Mitigation: graceful error message, retry button
- **Performance on low-end devices** — Mitigation: lazy load chat panel, CSS transitions instead of JS animations
