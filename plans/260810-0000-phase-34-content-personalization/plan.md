# Phase 34: Content Personalization & AI Recommendations — Implementation Plan

**Project:** algo-trader
**Date:** 2026-08-10
**Status:** Complete

---

## Overview

Deliver content personalization for the blog and newsletter: user engagement analytics, AI-driven post recommendations, A/B testing, comment moderation, and newsletter segmentation. Builds on the Phase 32b auto-marketing daemon and the landing-page blog hub.

---

## Phases

| # | Component | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Blog engagement tables (comments + A/B tests) | ✅ Done | `src/shared/db/migrations/035-add-blog-engagement-tables.ts` |
| 2 | Newsletter preferences table | ✅ Done | `src/shared/db/migrations/037-add-newsletter-preferences.ts` |
| 3 | Page-view analytics table | ✅ Done | `src/shared/db/migrations/055-add-blog-page-views.ts` |
| 4 | Comment moderation service | ✅ Done | `src/platform/api/routes/comment-moderation-service.ts` (LLM + keyword fallback) |
| 5 | Post similarity engine | ✅ Done | `src/shared/utils/post-similarity-engine.ts` (TF-IDF) |
| 6 | Blog engagement routes | ✅ Done | `src/platform/api/routes/blog-engagement-routes.ts` |
| 7 | Newsletter routes | ✅ Done | `src/platform/api/routes/newsletter-routes.ts` |
| 8 | Server wiring | ✅ Done | `src/platform/api/server.ts` mounts `/api/blog` + `/api/newsletter` |
| 9 | Migration registration | ✅ Done | `src/db/migration-runner.ts` registers 035/037/055 |

---

## Implementation Summary

### New Endpoints (all wired into platform API server)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/blog/posts/:postId/comments` | Submit comment (LLM-moderated, keyword fallback) |
| GET | `/api/blog/posts/:postId/comments` | List approved comments |
| GET | `/api/blog/posts/:postId/recommendations` | Similar posts via TF-IDF |
| POST | `/api/blog/page-views` | Record page view + time-on-page |
| GET | `/api/blog/page-views/stats` | Aggregate view stats (windowed) |
| POST | `/api/blog/ab-test/impression` | Record A/B impression |
| POST | `/api/blog/ab-test/click` | Record A/B click |
| POST | `/api/newsletter/subscribe` | Subscribe / update preferences |
| DELETE | `/api/newsletter/unsubscribe` | Unsubscribe |
| GET | `/api/newsletter/preferences` | Get preferences per email |
| GET | `/api/newsletter/segments` | List segments (admin) |

### Key Files
- `src/platform/api/routes/blog-engagement-routes.ts` — comments, recommendations, page-views, A/B test
- `src/platform/api/routes/newsletter-routes.ts` — subscribe, unsubscribe, preferences, segments
- `src/platform/api/routes/comment-moderation-service.ts` — LLM moderation with keyword fallback
- `src/shared/utils/post-similarity-engine.ts` — TF-IDF similarity (zero external API)
- `src/shared/db/migrations/035/037/055` — schema for comments, A/B tests, page views, newsletter prefs
- `src/db/migration-runner.ts` — registers all three migrations

### Wiring
- `blogRouter` + `blogEngagementRouter` mounted at `/api/blog`
- `newsletterRouter` mounted at `/api/newsletter`

---

## Verification

| Gate | Result |
|------|--------|
| `npm run build` (tsc) | ✅ 0 errors |
| Blog-engagement tests | ✅ 15/15 passing |
| Newsletter tests | ✅ 8/8 passing |
| Comment moderation tests | ✅ 8/8 passing |
| Post similarity tests | ✅ 8/8 passing |

---

## Notes

- `blog_page_views.view_duration_ms` capped at 24h to guard against malformed beacons
- Page views capture viewer_id, referrer, UTM params for attribution
- Newsletter segmentation supports frequency (daily/weekly/monthly/none), topics, and interests array
- A/B test impressions/clicks stored per-variant (A/B) in `blog_ab_tests`
- Comment moderation falls back to keyword detection when LLM router unavailable
