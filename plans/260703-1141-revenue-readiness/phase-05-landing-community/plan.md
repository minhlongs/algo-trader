---
title: "Phase 5 — Consolidate Landing + Launch Discord"
description: "Merge dual landing pages into one canonical funnel, fix Settings mock keys, launch Discord community channel"
status: pending
priority: P1
effort: S
needsStitch: true
---

# Phase 5 — Consolidate Landing + Launch Discord

## Context
- Two landing pages: `landing.tsx` at `/` and `landing-page.tsx` at `/cashclaw` — split conversion funnel
- Settings page creates fake `ak_live_mock_` API keys when backend unreachable — trust killer
- Zero community channels live (all social accounts marked "not yet registered")
- Marketing ready-to-post content exists but unpublishable

## Tasks
1. **Stitch Design**: Design consolidated landing page
2. **Frontend**: Merge landing pages, fix Settings mock keys
3. **Community**: Determine which channel to launch (Discord recommended)
4. **Content**: Publish first blog post, set up social presence

## Files to modify
- `dashboard/src/pages/landing.tsx` and `landing-page.tsx`
- `dashboard/src/pages/settings-page.tsx`
- `dashboard/src/App.tsx` (routing consolidation)
