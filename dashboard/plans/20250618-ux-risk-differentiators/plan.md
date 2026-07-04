---
title: UX/ Risk Management Differentiators
status: completed
priority: P1
effort: large
branch: feature/ux-risk-differentiators
tags: [ux, risk, alerts, visualization]
created: 2025-06-18
completed: 2025-06-18
---

# Plan — Trading Bot UX/ Risk Differentiators

## Overview

Implement advanced risk management UX differentiators to enhance user control, visibility, and decision-making capabilities. Build on existing Negative Risk Scanner foundation with proactive controls, real-time visualizations, and intelligent alerts.

**6 Phases:**
1. Risk Preferences Store (Zustand + localStorage)
2. Risk Visualization Components (Gauge, Heatmap, Sparkline)
3. Proactive Controls Panel (auto-close, circuit breakers)
4. Decision Aids Panel (what-if scenarios, confidence scores)
5. Alerts & Notifications System (toast container, preferences)
6. Integration (dashboard/neg-risk embedding, settings page, navigation)

**Key Constraints:**
- Pure frontend (no backend changes)
- Follow existing Stitch design tokens
- Files ≤200 lines each
- Full test coverage required
- Integrate with existing neg-risk scanner and dashboard
